# -*- coding: utf-8 -*-
"""可选：一键下载素材库（从原作者站点拉取到本地）。

⚠️ 重要定位
    本模块**不随仓库分发任何图片**。它只是帮用户把自己的机器
    变成「已就绪」状态：从原作者站点下载素材到用户本地目录。

    原作者（ギア）的使用条款：允许作品制作中的商用 / 编辑 / 参考使用，
    但**禁止再分发、转载、转售图像数据本身**。
    因此：
      · 用户自己下载到自己机器上用 = 允许（个人使用）
      · 把下载到的图再打包发给别人  = 禁止
    本模块只做前者。

设计要点
  · 仅用标准库（urllib / concurrent.futures / json / re）
  · 先抓站点首页 HTML，从头里的内嵌数据解析出索引（不依赖任何外部 API）
  · 再按索引逐个下载 thumbs/ 与 img/，写到本地素材根目录
  · 支持断点续传（已存在且非空的文件跳过）
  · 有进度回调，前端可轮询进度
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional

SOURCE_URL = "https://ai-pose-gallery.pages.dev/"

#: 原站内嵌数据的锚点
_META_RE = re.compile(r"const META=(\{.*?\});\s*\n\s*const D=(\[.*?\]);", re.S)

#: 各 image_id 的后缀 → 角度日文名（用于回填 angle_ja）
_SUFFIX_TO_ANGLE_JA = {
    "front": "正面",
    "high": "上から",
    "low": "下から",
    "side": "横",
    "diag": "斜め",
}

#: 角度日文 → 中文（与站点一致）
_ANGLE_JA_TO_ZH = {
    "正面": "正面",
    "上から": "上方",
    "下から": "下方",
    "横": "侧面",
    "斜め": "斜侧",
}

#: 系统日文 → 中文（兜底用；优先用 translations.py 里的完整表）
_SYSTEM_JA_TO_ZH = {
    "全身1人・セクシー系": "全身单人·性感系",
    "全身1人・標準系": "全身单人·标准系",
    "上半身1人": "上半身单人",
    "2人絡み": "双人互动",
}

#: 本插件自带的翻译表（翻译文本，随 MIT 代码分发；不含素材数据）
try:
    from .translations import POSE_NAMES_JA, CATEGORIES_JA, SYSTEMS_JA  # type: ignore
except Exception:  # 允许脱离包单独测试本模块
    try:
        from translations import POSE_NAMES_JA, CATEGORIES_JA, SYSTEMS_JA  # type: ignore
    except Exception:
        POSE_NAMES_JA, CATEGORIES_JA, SYSTEMS_JA = {}, {}, {}

UAS = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


class DownloadError(RuntimeError):
    """下载过程中的可展示错误。"""


# ---------------------------------------------------------------------------
# 进度状态（供前端轮询）
# ---------------------------------------------------------------------------

class DownloadProgress:
    """线程安全的下载进度。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.running = False
        self.phase = "idle"        # idle | index | images | done | error
        self.message = ""
        self.total_files = 0
        self.done_files = 0
        self.failed_files = 0
        self.skipped_files = 0
        self.bytes_downloaded = 0
        self.error: Optional[str] = None
        self.target_dir = ""
        self.started_at = 0.0
        self.finished_at = 0.0

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            pct = (self.done_files / self.total_files * 100.0) if self.total_files else 0.0
            elapsed = ((self.finished_at or time.time()) - self.started_at) if self.started_at else 0.0
            return {
                "running": self.running,
                "phase": self.phase,
                "message": self.message,
                "total_files": self.total_files,
                "done_files": self.done_files,
                "failed_files": self.failed_files,
                "skipped_files": self.skipped_files,
                "bytes_downloaded": self.bytes_downloaded,
                "bytes_mb": round(self.bytes_downloaded / 1024 / 1024, 1),
                "percent": round(pct, 1),
                "error": self.error,
                "target_dir": self.target_dir,
                "elapsed_sec": round(elapsed, 1),
            }

    def _set(self, **kw: Any) -> None:
        with self._lock:
            for k, v in kw.items():
                setattr(self, k, v)

    def inc(self, *, done: int = 0, failed: int = 0, skipped: int = 0, nbytes: int = 0) -> None:
        with self._lock:
            self.done_files += done
            self.failed_files += failed
            self.skipped_files += skipped
            self.bytes_downloaded += nbytes


# 全局单例（ComfyUI 是单进程，够用）
PROGRESS = DownloadProgress()
_worker: Optional[threading.Thread] = None


# ---------------------------------------------------------------------------
# 索引抓取与解析
# ---------------------------------------------------------------------------

def _http_get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": UAS,
        "Referer": SOURCE_URL,
        "Accept": "*/*",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_index(source_url: str = SOURCE_URL, timeout: int = 60) -> Dict[str, Any]:
    """从原站首页抓取内嵌索引，转换成插件使用的 pose-index 结构。

    不依赖任何第三方 API，也不依赖仓库里预先存好的索引文件。
    """
    src = (source_url or SOURCE_URL).rstrip("/") + "/"
    try:
        html = _http_get(src, timeout=timeout).decode("utf-8", "replace")
    except Exception as exc:
        raise DownloadError("无法访问素材站点：%s（%s）" % (src, exc))

    m = _META_RE.search(html)
    if not m:
        raise DownloadError(
            "站点页面结构已变化，没能解析出内嵌数据。\n"
            "可以改用「手动模式」：自行下载素材后，把 data/pose-index.json 放到素材根目录。"
        )
    try:
        meta_raw = json.loads(m.group(1))
        data = json.loads(m.group(2))
    except Exception as exc:
        raise DownloadError("解析内嵌数据失败：%s" % exc)
    if not isinstance(data, list) or not data:
        raise DownloadError("内嵌数据为空，可能站点已改版。")

    # 原始记录形如：
    #   {"id":..., "系統":..., "ポーズ番号":..., "分類":..., "ポーズ名":...,
    #    "アングル":..., "サムネ":"thumbs/x.jpg", "原寸":"img/x.png"}
    poses: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []
    for e in data:
        iid = str(e.get("id") or "")
        if not iid:
            continue
        pid = iid.rsplit("_", 1)[0]
        sys_ja = str(e.get("系統") or "")
        ang_ja = str(e.get("アングル") or "")
        ang_zh = _ANGLE_JA_TO_ZH.get(ang_ja, ang_ja)

        if pid not in poses:
            cat_ja = str(e.get("分類") or "")
            name_ja = str(e.get("ポーズ名") or "")
            poses[pid] = {
                "pose_id": pid,
                "system": SYSTEMS_JA.get(sys_ja) or _SYSTEM_JA_TO_ZH.get(sys_ja, sys_ja),
                "system_ja": sys_ja,
                "number": str(e.get("ポーズ番号") or ""),
                # 中文名优先查内置翻译表；查不到就原样显示日文，不报错
                "category": CATEGORIES_JA.get(cat_ja, cat_ja),
                "category_ja": cat_ja,
                "name": POSE_NAMES_JA.get(name_ja, name_ja),
                "name_ja": name_ja,
                "angles": {},
            }
            order.append(pid)

        poses[pid]["angles"][ang_zh] = {
            "id": iid,
            "thumb": str(e.get("サムネ") or ""),
            "full": str(e.get("原寸") or ""),
            "angle_ja": ang_ja,
        }

    systems = []
    for l in (meta_raw.get("lines") or []):
        ja = str(l)
        zh = SYSTEMS_JA.get(ja) or _SYSTEM_JA_TO_ZH.get(ja, ja)
        if zh not in systems:
            systems.append(zh)

    pose_list = [poses[k] for k in order]
    total_images = sum(len(p["angles"]) for p in pose_list)

    return {
        "meta": {
            "title": "姿态素材集 POSE-DB-01",
            "title_ja": "ポーズ集 POSE-DB-01",
            "source_url": src,
            "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "total_images": total_images,
            "total_poses": len(pose_list),
            "systems": systems,
            "categories": sorted({p["category"] for p in pose_list if p["category"]}),
            "angles": ["正面", "上方", "下方", "侧面", "斜侧"],
            "image_sizes": {"thumb": "300x400", "full": "900x1200"},
            "license_note": (
                "素材著作权归原作者 ギア（https://x.com/giaaibusi）所有。"
                "允许作品制作中的商用/编辑/参考使用；禁止再分发、转载、转售图像数据本身。"
                "本文件由插件从原站下载生成，仅存放于本机。"
            ),
        },
        "poses": pose_list,
    }


# ---------------------------------------------------------------------------
# 下载
# ---------------------------------------------------------------------------

def _file_ok(path: str, min_size: int = 512) -> bool:
    try:
        return os.path.isfile(path) and os.path.getsize(path) >= min_size
    except OSError:
        return False


def _download_one(url: str, dst: str, timeout: int = 90, retries: int = 3) -> int:
    """下载单个文件到 dst（先写 .part 再原子改名）。返回字节数。"""
    last: Optional[str] = None
    for attempt in range(retries):
        try:
            data = _http_get(url, timeout=timeout)
            if not data:
                raise DownloadError("空响应")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            tmp = dst + ".part"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, dst)
            return len(data)
        except Exception as exc:
            last = str(exc)[:120]
            time.sleep(1.0 * (attempt + 1))
    raise DownloadError(last or "未知错误")


def download_all(
    target_dir: str,
    *,
    source_url: str = SOURCE_URL,
    thumbs: bool = True,
    fulls: bool = True,
    workers: int = 8,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    limit_poses: Optional[int] = None,
) -> Dict[str, Any]:
    """把素材库下载到 target_dir。

    目录结构（与插件读取方式一致）：
        target_dir/data/pose-index.json
        target_dir/thumbs/<id>.jpg
        target_dir/img/<id>.png

    返回最终进度快照。会就地更新全局 PROGRESS。
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    target_dir = os.path.abspath(target_dir)
    PROGRESS._set(
        running=True, phase="index", message="正在读取站点索引…",
        error=None, target_dir=target_dir, started_at=time.time(),
        total_files=0, done_files=0, failed_files=0, skipped_files=0,
        bytes_downloaded=0, finished_at=0.0,
    )

    try:
        index = fetch_index(source_url)
        if limit_poses:
            index["poses"] = index["poses"][: int(limit_poses)]
        poses = index["poses"]

        # 写索引前先按实际情况修正统计（只下一部分时不能还写全量数字，
        # 否则界面上会显示「1439 图」而实际只有几十张，造成误解）
        _n_imgs = sum(len(p["angles"]) for p in poses)
        index["meta"]["total_poses"] = len(poses)
        index["meta"]["total_images"] = _n_imgs
        if not thumbs:
            index["meta"]["note_thumbs"] = "本次未下载缩略图（面板预览可能不可用）"
        if not fulls:
            index["meta"]["note_fulls"] = "本次未下载原图（节点读图会失败）"

        # 写索引
        os.makedirs(os.path.join(target_dir, "data"), exist_ok=True)
        idx_path = os.path.join(target_dir, "data", "pose-index.json")
        with open(idx_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(index, f, ensure_ascii=False, indent=1)

        # 收集任务
        base = (source_url or SOURCE_URL).rstrip("/") + "/"
        jobs: List[tuple] = []
        for p in poses:
            for ang, info in p["angles"].items():
                iid = info.get("id") or ""
                if not iid:
                    continue
                if thumbs and info.get("thumb"):
                    jobs.append((base + info["thumb"].lstrip("/"),
                                 os.path.join(target_dir, info["thumb"].replace("/", os.sep))))
                if fulls and info.get("full"):
                    jobs.append((base + info["full"].lstrip("/"),
                                 os.path.join(target_dir, info["full"].replace("/", os.sep))))

        # 去重
        seen = set()
        uniq = []
        for url, dst in jobs:
            if dst in seen:
                continue
            seen.add(dst)
            uniq.append((url, dst))
        jobs = uniq

        PROGRESS._set(total_files=len(jobs), phase="images",
                      message="正在下载 %d 个文件…" % len(jobs))
        if on_progress:
            on_progress(PROGRESS.snapshot())

        def work(job):
            url, dst = job
            if _file_ok(dst):
                return ("skip", 0)
            try:
                n = _download_one(url, dst)
                return ("ok", n)
            except Exception:
                return ("fail", 0)

        with ThreadPoolExecutor(max_workers=max(1, min(int(workers), 16))) as ex:
            futures = [ex.submit(work, j) for j in jobs]
            for i, fu in enumerate(as_completed(futures), 1):
                kind, n = fu.result()
                if kind == "ok":
                    PROGRESS.inc(done=1, nbytes=n)
                elif kind == "skip":
                    PROGRESS.inc(done=1, skipped=1)
                else:
                    PROGRESS.inc(done=1, failed=1)
                if on_progress and (i % 20 == 0 or i == len(jobs)):
                    on_progress(PROGRESS.snapshot())

        snap = PROGRESS.snapshot()
        ok = snap["failed_files"] == 0
        PROGRESS._set(
            running=False, finished_at=time.time(),
            phase="done" if ok else "error",
            message=("下载完成" if ok else "下载完成，但有 %d 个文件失败" % snap["failed_files"]),
            error=None if ok else "%d 个文件下载失败，可重试（已下载的会跳过）" % snap["failed_files"],
        )
        return PROGRESS.snapshot()

    except Exception as exc:
        PROGRESS._set(running=False, phase="error", error=str(exc),
                      message="下载失败", finished_at=time.time())
        raise


def start_background(target_dir: str, **kwargs: Any) -> bool:
    """在后台线程启动下载。返回是否成功启动（已有任务在跑则返回 False）。"""
    global _worker
    if _worker is not None and _worker.is_alive():
        return False
    _worker = threading.Thread(
        target=lambda: _safe_run(target_dir, **kwargs),
        name="pose-gallery-downloader", daemon=True,
    )
    _worker.start()
    return True


def _safe_run(target_dir: str, **kwargs: Any) -> None:
    try:
        download_all(target_dir, **kwargs)
    except Exception:
        # 错误已写进 PROGRESS，这里只需吞掉，避免线程异常噪音
        pass

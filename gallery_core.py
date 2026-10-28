# -*- coding: utf-8 -*-
"""Pose Gallery 数据核心。

只依赖标准库；图像解码（PIL / numpy / torch）在使用时才惰性导入，
因此本模块可以脱离 ComfyUI 单独导入、单独测试。

数据来源（按优先级）：
 1. 节点上显式传入的 gallery_root
 2. 插件目录下 config.json 的 "gallery_root"
 3. 环境变量 POSE_GALLERY_ROOT
 4. 自动探测：从插件目录向上/向常见位置找 data/pose-index.json

索引格式见 README（由静态站克隆目录的 data/pose-index.json 提供）。
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Iterable, List, Optional, Sequence

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(PLUGIN_DIR, "config.json")
INDEX_REL = os.path.join("data", "pose-index.json")

# 自动探测时依次尝试的候选根目录（相对插件目录的常见排布 + 绝对路径）
# 自动探测只在**插件目录内部**与**其上一级**找，不向上跳跃横跨其它目录。
# 刻意去掉了「../../ai-pose-gallery-clone」这类指向特定第三方素材库的硬编码候选 ——
# 本仓库是通用工具，不应默认去读某个特定作者的素材。
AUTO_CANDIDATES = [
    ".",                       # 插件目录本身就是素材库根
    "..",                      # 素材库根是插件目录的上一级（插件放在库目录内的常见情形）
]


class GalleryError(RuntimeError):
    """数据缺失 / 路径非法等可向用户直接展示的错误。"""


# ---------------------------------------------------------------------------
# 根目录解析
# ---------------------------------------------------------------------------

def _read_config() -> Dict[str, Any]:
    if not os.path.isfile(CONFIG_FILE):
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _is_gallery_root(path: str) -> bool:
    return bool(path) and os.path.isfile(os.path.join(path, INDEX_REL))


def resolve_gallery_root(explicit: Optional[str] = None) -> str:
    """定位站点根目录（含 data/pose-index.json 与 thumbs/ img/ 的那一层）。

    显式指定的路径（节点参数 / config.json / 环境变量）如果**给了但无效**，
    直接报错而不是悄悄回退到自动探测 —— 否则用户填错路径时会莫名拿到另一份数据。
    """
    tried: List[str] = []

    def check(path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        p = os.path.abspath(os.path.expanduser(str(path).strip()))
        tried.append(p)
        return p if _is_gallery_root(p) else None

    def strict(path: Optional[str], source: str) -> Optional[str]:
        """显式来源：给了就必须有效。"""
        if not path or not str(path).strip():
            return None
        p = os.path.abspath(os.path.expanduser(str(path).strip()))
        tried.append(p)
        if _is_gallery_root(p):
            return p
        raise GalleryError(
            "%s 指定的图库路径无效：%s\n该目录下没有 data/pose-index.json。"
            "请指向包含 data/、thumbs/、img/ 的那一层目录。" % (source, p)
        )

    hit = strict(explicit, "节点参数 gallery_root")
    if hit:
        return hit

    hit = strict(_read_config().get("gallery_root"), "config.json 的 gallery_root")
    if hit:
        return hit

    hit = strict(os.environ.get("POSE_GALLERY_ROOT"), "环境变量 POSE_GALLERY_ROOT")
    if hit:
        return hit

    for rel in AUTO_CANDIDATES:
        hit = check(os.path.join(PLUGIN_DIR, rel))
        if hit:
            return hit

    raise GalleryError(
        "没找到姿态库数据（data/pose-index.json）。已尝试：\n  "
        + "\n  ".join(tried)
        + "\n请在本插件目录的 config.json 里写 {\"gallery_root\": \"<站点根目录>\"}，"
          "或设置环境变量 POSE_GALLERY_ROOT。"
    )


def read_config_example() -> Dict[str, Any]:
    return {"gallery_root": "<改成 ai-pose-gallery-clone 的绝对路径>"}


# ---------------------------------------------------------------------------
# 数据存储
# ---------------------------------------------------------------------------

class GalleryStore:
    """姿态库只读存储。构造后数据常驻内存（288 姿态规模下开销可忽略）。"""

    def __init__(self, root: str, payload: Dict[str, Any]):
        self.root = os.path.abspath(root)
        self.meta: Dict[str, Any] = payload.get("meta") or {}
        poses = payload.get("poses")
        if not isinstance(poses, list):
            raise GalleryError("索引文件缺少 poses 数组：%s" % self.index_path)
        self.poses: List[Dict[str, Any]] = [p for p in poses if isinstance(p, dict)]

        self.by_pose_id: Dict[str, Dict[str, Any]] = {}
        self.by_image_id: Dict[str, Any] = {}   # image_id -> (pose, angle, info)
        for p in self.poses:
            pid = str(p.get("pose_id") or "")
            if pid:
                self.by_pose_id[pid] = p
            for angle, info in (p.get("angles") or {}).items():
                if not isinstance(info, dict):
                    continue
                iid = str(info.get("id") or "")
                if iid:
                    self.by_image_id[iid] = (p, angle, info)

        # 便于下拉框的枚举（保持索引里的原始顺序，不排序）
        self.systems: List[str] = list(self.meta.get("systems") or [])
        if not self.systems:
            self.systems = _ordered_unique(p.get("system") for p in self.poses)
        self.categories: List[str] = list(self.meta.get("categories") or [])
        if not self.categories:
            self.categories = _ordered_unique(p.get("category") for p in self.poses)
        self.angles: List[str] = list(self.meta.get("angles") or [])
        if not self.angles:
            self.angles = _ordered_unique(
                a for p in self.poses for a in (p.get("angles") or {})
            )

    # -- 构造 --------------------------------------------------------------
    @property
    def index_path(self) -> str:
        return os.path.join(self.root, INDEX_REL)

    @classmethod
    def load(cls, gallery_root: Optional[str] = None) -> "GalleryStore":
        root = resolve_gallery_root(gallery_root)
        path = os.path.join(root, INDEX_REL)
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as exc:
            raise GalleryError("读取索引失败：%s（%s）" % (path, exc))
        return cls(root, payload)

    # -- 查询 --------------------------------------------------------------
    def get_pose(self, pose_id: str) -> Optional[Dict[str, Any]]:
        return self.by_pose_id.get(str(pose_id or "").strip())

    def get_image(self, image_id: str):
        return self.by_image_id.get(str(image_id or "").strip())

    def query(
        self,
        q: Optional[str] = None,
        system: Optional[str] = None,
        category: Optional[str] = None,
        angle: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """按条件过滤姿态。q 在中文名 / 日文名 / pose_id / 系统 / 分类里做子串匹配。"""
        needle = (q or "").strip().lower()
        system = (system or "").strip()
        category = (category or "").strip()
        angle = (angle or "").strip()

        out: List[Dict[str, Any]] = []
        for p in self.poses:
            if system and p.get("system") != system:
                continue
            if category and p.get("category") != category:
                continue
            if angle and angle not in (p.get("angles") or {}):
                continue
            if needle:
                hay = " ".join(
                    str(p.get(k, ""))
                    for k in ("name", "name_ja", "pose_id", "system", "system_ja",
                              "category", "category_ja", "number")
                ).lower()
                if needle not in hay:
                    continue
            out.append(p)
        return out

    def offsets(self, pose: Dict[str, Any]) -> List[str]:
        """该姿态实际存在的角度，按 meta.angles 的顺序。"""
        angles = pose.get("angles") or {}
        order = [a for a in self.angles if a in angles]
        extra = [a for a in angles if a not in order]
        return order + extra

    def pose_images(self, pose: Dict[str, Any], only_angle: Optional[str] = None) -> List[Dict[str, Any]]:
        """把姿态展开成图片列表（每项含 id/angle/thumb/full 的绝对路径）。"""
        angles = self.offsets(pose)
        if only_angle:
            angles = [a for a in angles if a == only_angle]
        rows = []
        for a in angles:
            info = (pose.get("angles") or {}).get(a) or {}
            rows.append({
                "image_id": str(info.get("id") or ""),
                "pose_id": str(pose.get("pose_id") or ""),
                "angle": a,
                "thumb": self.abs_path(info.get("thumb")),
                "full": self.abs_path(info.get("full")),
                "name": str(pose.get("name") or ""),
                "name_ja": str(pose.get("name_ja") or ""),
                "system": str(pose.get("system") or ""),
                "category": str(pose.get("category") or ""),
                "number": str(pose.get("number") or ""),
            })
        return [r for r in rows if r["full"]]

    # -- 路径 --------------------------------------------------------------
    def abs_path(self, rel: Optional[str]) -> str:
        if not rel:
            return ""
        rel = str(rel).replace("\\", "/")
        return os.path.abspath(os.path.join(self.root, rel.replace("/", os.sep)))

    def rel_url(self, rel: Optional[str]) -> str:
        """给前端用的相对 URL。"""
        if not rel:
            return ""
        return "/" + str(rel).replace("\\", "/").lstrip("/")

    # -- 汇总 --------------------------------------------------------------
    def stats(self) -> Dict[str, Any]:
        by_system: Dict[str, int] = {}
        by_category: Dict[str, int] = {}
        by_angle: Dict[str, int] = {}
        for p in self.poses:
            by_system[p.get("system", "")] = by_system.get(p.get("system", ""), 0) + 1
            by_category[p.get("category", "")] = by_category.get(p.get("category", ""), 0) + 1
            for a in (p.get("angles") or {}):
                by_angle[a] = by_angle.get(a, 0) + 1
        return {
            "total_poses": len(self.poses),
            "total_images": len(self.by_image_id),
            "by_system": by_system,
            "by_category": by_category,
            "by_angle": by_angle,
        }


def _ordered_unique(items: Iterable[Any]) -> List[str]:
    seen, out = set(), []
    for x in items:
        if x is None:
            continue
        s = str(x)
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


# ---------------------------------------------------------------------------
# 图像解码（惰性导入，脱离 ComfyUI 也能 import 本模块）
# ---------------------------------------------------------------------------

def load_image_tensor(paths: Sequence[str]):
    """把图片读成 ComfyUI 的 IMAGE 张量：[B, H, W, 3] float32，范围 0~1。

    尺寸不一致时按「最大宽高 + 居中补边」对齐（避免直接报错）。
    """
    import numpy as np
    from PIL import Image

    arrs = []
    for path in paths:
        if not path or not os.path.isfile(path):
            raise GalleryError("图片不存在：%s" % path)
        with Image.open(path) as im:
            im = im.convert("RGB")
            arrs.append(np.asarray(im, dtype=np.float32) / 255.0)
    if not arrs:
        raise GalleryError("没有可加载的图片")

    max_h = max(a.shape[0] for a in arrs)
    max_w = max(a.shape[1] for a in arrs)
    if len({(a.shape[0], a.shape[1]) for a in arrs}) > 1:
        padded = []
        for a in arrs:
            canvas = np.ones((max_h, max_w, 3), dtype=np.float32)
            top = (max_h - a.shape[0]) // 2
            left = (max_w - a.shape[1]) // 2
            canvas[top:top + a.shape[0], left:left + a.shape[1]] = a
            padded.append(canvas)
        arrs = padded

    batch = np.stack(arrs, axis=0)
    try:
        import torch
        return torch.from_numpy(batch)
    except Exception:
        # 没有 torch 时返回 numpy，便于离线测试
        return batch

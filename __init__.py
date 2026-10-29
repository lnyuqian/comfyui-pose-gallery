# -*- coding: utf-8 -*-
"""ComfyUI Pose Gallery 插件入口。

对外暴露：
  NODE_CLASS_MAPPINGS / NODE_DISPLAY_NAME_MAPPINGS  —— 节点注册
  WEB_DIRECTORY                                     —— 前端扩展（图库选择面板）
  API 路由                                          —— 给前端拉列表 / 缩略图

路由都挂在 /pose_gallery/* 下，与其它插件不冲突。
后端接口只读本地文件，不写任何东西。

状态：已在真实 ComfyUI（v0.37.0 / 前端 1.53.6）中实测通过，
包括图库面板、素材下载、以及与 Qwen-Image-2.1 图生图的完整出图链路。
"""

import json
import os
import sys
from typing import Any, Dict
from urllib.parse import quote

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .gallery_core import (
    GalleryError,
    GalleryStore,
    resolve_gallery_root,
    default_library_dir,
)

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_CONFIG = os.path.join(_PLUGIN_DIR, "config.json")

# 加载时打印一次提示。
# 注意：Windows 中文环境下 ComfyUI 的 stdout 常是 GBK 代码页，
# 直接 print 非 GBK 字符（如 "⚠️" 或部分中文标点）会抛 UnicodeEncodeError，
# 进而使整个插件导入失败、节点不注册。这里统一走安全打印。
def _safe_print(msg: str) -> None:
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        try:
            enc = getattr(sys.stdout, "encoding", None) or "ascii"
            print(msg.encode(enc, "replace").decode(enc, "replace"), flush=True)
        except Exception:
            pass
    except Exception:
        pass


_safe_print(
    "[PoseGallery] 已加载 4 个节点（单张 / 角度组 / 批量 / 取单张）。"
    " 图库面板路由挂在 /pose_gallery/*。"
)


def _configured_root() -> str:
    """读 config.json 里的 gallery_root；没有就返回空串让核心层自动探测。"""
    try:
        if os.path.isfile(_CONFIG):
            with open(_CONFIG, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return str(data.get("gallery_root") or "")
    except Exception:
        pass
    return ""


def _get_store() -> GalleryStore:
    return GalleryStore.load(_configured_root() or None)


# ---------------------------------------------------------------------------
# 素材存放位置（用于「一键下载」）—— 实现在 gallery_core，这里只做转发
# ---------------------------------------------------------------------------

def _library_status(path: str) -> Dict[str, Any]:
    """检查某个素材目录的现状。"""
    idx = os.path.join(path, "data", "pose-index.json")
    out: Dict[str, Any] = {
        "path": path,
        "index_exists": os.path.isfile(idx),
        "thumbs": 0,
        "images": 0,
        "total_mb": 0.0,
    }
    for sub, key in (("thumbs", "thumbs"), ("img", "images")):
        d = os.path.join(path, sub)
        if os.path.isdir(d):
            n = 0
            size = 0
            try:
                with os.scandir(d) as it:
                    for e in it:
                        if e.is_file():
                            n += 1
                            try:
                                size += e.stat().st_size
                            except OSError:
                                pass
            except OSError:
                pass
            out[key] = n
            out["total_mb"] += size / 1024 / 1024
    out["total_mb"] = round(out["total_mb"], 1)
    out["ready"] = bool(out["index_exists"] and out["images"] > 0)
    return out


# ---------------------------------------------------------------------------
# 注册 HTTP 路由（ComfyUI 不存在时静默跳过，保证可独立导入测试）
# ---------------------------------------------------------------------------

def _register_routes():
    try:
        from server import PromptServer
        from aiohttp import web
    except Exception:
        return False

    routes = PromptServer.instance.routes

    @routes.get("/pose_gallery/config")
    async def api_config(request):
        try:
            store = _get_store()
            root, ok = store.root, True
            meta = store.meta or {}
            info = {
                "title": meta.get("title", ""),
                "total_poses": len(store.poses),
                "total_images": len(store.by_image_id),
                "systems": store.systems,
                "categories": store.categories,
                "angles": store.angles,
            }
        except GalleryError as exc:
            # 数据还没准备好时，不要在面板上直接报错让用户懵 ——
            # 告诉前端「需要先下载」即可。
            root, ok = "", False
            info = {"error": str(exc)}
        lib = default_library_dir()
        return web.json_response({
            "ok": True,
            "ready": ok,
            "root": root,
            "library_dir": lib,
            "library": _library_status(lib),
            **info,
        })

    # ---- 一键下载素材 ----

    @routes.get("/pose_gallery/download/status")
    async def api_dl_status(request):
        from . import downloader as dlm
        return web.json_response({
            "ok": True,
            "progress": dlm.PROGRESS.snapshot(),
            "library_dir": default_library_dir(),
            "library": _library_status(default_library_dir()),
        })

    @routes.post("/pose_gallery/download/start")
    async def api_dl_start(request):
        from . import downloader as dlm
        if dlm.PROGRESS.snapshot()["running"]:
            return web.json_response({"ok": False, "error": "已有下载任务在进行中"}, status=409)

        body: Dict[str, Any] = {}
        try:
            if request.can_read_body:
                body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        target = str(body.get("target_dir") or "").strip() or default_library_dir()
        thumbs = bool(body.get("thumbs", True))
        fulls = bool(body.get("fulls", True))
        if not thumbs and not fulls:
            return web.json_response(
                {"ok": False, "error": "至少要选一种（缩略图或原图）"}, status=400)

        try:
            workers = max(1, min(int(body.get("workers", 8)), 16))
        except (TypeError, ValueError):
            workers = 8

        # 只下载前 N 个姿态（用于先试一小批，避免一上来就拉几百 MB）
        limit_poses = None
        raw_limit = body.get("limit_poses")
        if raw_limit not in (None, "", 0, "0"):
            try:
                limit_poses = max(1, int(raw_limit))
            except (TypeError, ValueError):
                limit_poses = None

        started = dlm.start_background(
            target, thumbs=thumbs, fulls=fulls, workers=workers,
            limit_poses=limit_poses,
        )
        if not started:
            return web.json_response({"ok": False, "error": "已有下载任务在进行中"}, status=409)
        return web.json_response({
            "ok": True, "target_dir": os.path.abspath(target),
            "limit_poses": limit_poses,
            "message": "下载已开始，轮询 /pose_gallery/download/status 查看进度",
        })

    @routes.get("/pose_gallery/poses")
    async def api_poses(request):
        q = request.query
        try:
            store = _get_store()
        except GalleryError as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        system = q.get("system") or None
        category = q.get("category") or None
        angle = q.get("angle") or None
        keyword = q.get("q") or None
        try:
            limit = max(1, min(int(q.get("limit", 40)), 500))
        except (TypeError, ValueError):
            limit = 40
        try:
            offset = max(0, int(q.get("offset", 0)))
        except (TypeError, ValueError):
            offset = 0

        found = store.query(q=keyword, system=system, category=category, angle=angle)
        page = found[offset: offset + limit]
        items = []
        for p in page:
            images = store.pose_images(p)
            cover = images[0] if images else None
            items.append({
                "pose_id": p.get("pose_id", ""),
                "name": p.get("name", ""),
                "name_ja": p.get("name_ja", ""),
                "system": p.get("system", ""),
                "category": p.get("category", ""),
                "number": p.get("number", ""),
                "angles": store.offsets(p),
                # cover 走 /pose_gallery/thumb 路由：
                # 图库目录通常不在 ComfyUI 的 web 根下，直接给 /thumbs/xxx.jpg 必然 404。
                "cover": cover["image_id"] if cover else "",
                "cover_url": (
                    "/pose_gallery/thumb?image_id=" + quote(cover["image_id"])
                ) if cover and cover.get("image_id") else "",
                "image_ids": [i["image_id"] for i in images],
            })
        return web.json_response({
            "ok": True, "total": len(found), "offset": offset,
            "limit": limit, "count": len(items), "items": items,
        })

    @routes.get("/pose_gallery/pose/{pose_id}")
    async def api_pose(request):
        pid = request.match_info.get("pose_id", "")
        try:
            store = _get_store()
        except GalleryError as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        pose = store.get_pose(pid)
        if not pose:
            return web.json_response({"ok": False, "error": "没有这个姿态：%s" % pid}, status=404)
        images = []
        for r in store.pose_images(pose):
            images.append({
                "image_id": r["image_id"],
                "angle": r["angle"],
                "thumb_url": (
                    "/pose_gallery/thumb?image_id=" + quote(r["image_id"])
                ) if r.get("image_id") else "",
                "full_path": r["full"],
            })
        return web.json_response({
            "ok": True,
            "pose": {
                "pose_id": pose.get("pose_id", ""),
                "name": pose.get("name", ""),
                "name_ja": pose.get("name_ja", ""),
                "system": pose.get("system", ""),
                "category": pose.get("category", ""),
                "number": pose.get("number", ""),
                "images": images,
            },
        })

    @routes.get("/pose_gallery/thumb")
    async def api_thumb(request):
        """按 image_id 回缩略图（前端网格用它，省得拼路径）。"""
        iid = request.query.get("image_id", "")
        try:
            store = _get_store()
        except GalleryError as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        hit = store.by_image_id.get(iid)
        if not hit:
            raise web.HTTPNotFound()
        pose, angle, info = hit
        thumb = store.abs_path(info.get("thumb"))
        if not thumb or not os.path.isfile(thumb):
            raise web.HTTPNotFound()
        return web.FileResponse(thumb)

    return True


try:
    ROUTES_REGISTERED = _register_routes()
except Exception as _exc:  # 路由注册失败不应导致整个 ComfyUI 起不来
    print("[PoseGallery] 路由注册失败（插件仍可用，图库面板不可用）：%s" % _exc)
    ROUTES_REGISTERED = False

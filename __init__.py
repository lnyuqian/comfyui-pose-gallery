# -*- coding: utf-8 -*-
"""ComfyUI Pose Gallery 插件入口。

对外暴露：
  NODE_CLASS_MAPPINGS / NODE_DISPLAY_NAME_MAPPINGS  —— 节点注册
  WEB_DIRECTORY                                     —— 前端扩展（图库选择面板）
  API 路由                                          —— 给前端拉列表 / 缩略图

路由都挂在 /pose_gallery/* 下，与其它插件不冲突。
后端接口只读本地文件，不写任何东西。
"""

import json
import os

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .gallery_core import GalleryError, GalleryStore, resolve_gallery_root

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_CONFIG = os.path.join(_PLUGIN_DIR, "config.json")


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
        except GalleryError as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        meta = store.meta or {}
        return web.json_response({
            "ok": True,
            "root": store.root,
            "title": meta.get("title", ""),
            "total_poses": len(store.poses),
            "total_images": len(store.by_image_id),
            "systems": store.systems,
            "categories": store.categories,
            "angles": store.angles,
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
                "cover": cover["thumb"] if cover else "",
                "cover_url": store.rel_url(
                    (p.get("angles") or {}).get(store.offsets(p)[0], {}).get("thumb", "")
                ) if store.offsets(p) else "",
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
                "thumb_url": store.rel_url(
                    (pose.get("angles") or {}).get(r["angle"], {}).get("thumb", "")
                ),
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

    @routes.get("/pose_gallery/stats")
    async def api_stats(request):
        try:
            store = _get_store()
        except GalleryError as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        return web.json_response({"ok": True, "stats": store.stats()})

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

    @routes.get("/pose_gallery/full")
    async def api_full(request):
        """原图（点击放大时用）。"""
        iid = request.query.get("image_id", "")
        try:
            store = _get_store()
        except GalleryError as exc:
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
        hit = store.by_image_id.get(iid)
        if not hit:
            raise web.HTTPNotFound()
        pose, angle, info = hit
        full = store.abs_path(info.get("full"))
        if not full or not os.path.isfile(full):
            raise web.HTTPNotFound()
        return web.FileResponse(full)

    return True


try:
    ROUTES_REGISTERED = _register_routes()
except Exception as _exc:  # 路由注册失败不应导致整个 ComfyUI 起不来
    print("[PoseGallery] 路由注册失败（插件仍可用，图库面板不可用）：%s" % _exc)
    ROUTES_REGISTERED = False

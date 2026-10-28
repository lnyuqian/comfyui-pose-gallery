# -*- coding: utf-8 -*-
"""ComfyUI 节点定义：姿态素材库（Pose Gallery）。

三个节点，覆盖「单张 / 一组角度 / 一批」三种用法：

  1. PoseGalleryLoader      —— 选 1 个姿态（可选单一角度），输出 IMAGE + 元信息
  2. PoseGalleryAngleSet    —— 选 1 个姿态的全部角度（可筛选），输出批次 + 每张的元信息
  3. PoseGalleryBatchLoader —— 按系统/分类/关键词批量取姿态（每组角度数可选），
                               输出大批次 + 与之严格对齐的元信息列表

所有节点输出：
  IMAGE        [B,H,W,3] 已归一化到 0~1
  META_JSON    单个 dict / 列表（可直接在节点里看到编号、名称、原图路径等）
  IMAGE_IDS    list[str]，与 IMAGE 的 batch 顺序一一对应
  PATHS        list[str]，本地原图绝对路径（供其它节点按需二次读取）

设计取舍（参考了 netaart/comfyui-browser、ComfyUI-ArtGallery、
BigStationW/ComfyUi-ImageGalleryLoader 的做法）：
  · 用「后端路由 + 前端 JS 面板」而不是把 288 条塞进下拉框（后者会卡）；
  · 选中的结果通过 hidden 的 STRING 传回后端（ComfyUI 的标准做法）；
  · 前端只负责挑，真正读图在后端，避免浏览器反复上传。
"""

from __future__ import annotations

import glob
import json
import os
from typing import Any, Dict, List, Optional

from .gallery_core import GalleryError, GalleryStore, load_image_tensor

CATEGORY = "Pose Gallery"

_ANY = "(任意)"
_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_ROOT_FILE = os.path.join(_PLUGIN_DIR, "config.json")


# ---------------------------------------------------------------------------
# 公共工具
# ---------------------------------------------------------------------------

def _store(gallery_root: str = "") -> GalleryStore:
    return GalleryStore.load(gallery_root or None)


def _split_ids(raw: Any) -> List[str]:
    """把前端传来的选择解析成 id 列表。支持 JSON 数组 / 逗号分隔 / 换行分隔。"""
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        return [str(x).strip() for x in raw if str(x).strip()]
    text = str(raw).strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return [str(x).strip() for x in data if str(x).strip()]
        except Exception:
            pass
    parts = text.replace("\r", "\n").replace(",", "\n").split("\n")
    return [p.strip() for p in parts if p.strip()]


def _resolve_rows(store: GalleryStore, selection: List[str], angle: str = "") -> List[Dict[str, Any]]:
    """把选择项解析为图片行。

    选择项可以是：
      · pose_id（如 full_sexy_P001）      → 展开为该姿态的各角度
      · image_id（如 full_sexy_P001_front）→ 单张
      · "*" 或 "all:系统/分类"              → 交给调用方先用 query 处理，这里不解析
    """
    rows: List[Dict[str, Any]] = []
    for item in selection:
        if item in ("*", "all"):
            continue
        if item in store.by_pose_id:
            rows.extend(store.pose_images(store.by_pose_id[item], angle or None))
            continue
        hit = store.by_image_id.get(item)
        if hit:
            pose, ang, _ = hit
            rows.extend(store.pose_images(pose, ang))
            continue
    # 去重（保序）
    seen, out = set(), []
    for r in rows:
        if r["image_id"] in seen:
            continue
        seen.add(r["image_id"])
        out.append(r)
    return out


def _meta_of(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """输出的轻量元信息（不含路径用不上的冗余字段）。"""
    return [
        {
            "image_id": r["image_id"],
            "pose_id": r["pose_id"],
            "angle": r["angle"],
            "name": r["name"],
            "name_ja": r["name_ja"],
            "system": r["system"],
            "category": r["category"],
            "number": r["number"],
            "full_path": r["full"],
        }
        for r in rows
    ]


def _blank_image(size: int = 64):
    import numpy as np
    arr = np.ones((1, size, size, 3), dtype=np.float32)
    try:
        import torch
        return torch.from_numpy(arr)
    except Exception:
        return arr


def _empty_outputs(note: str):
    return (_blank_image(), [], [], [], note)


# ---------------------------------------------------------------------------
# 节点 1：单姿态 / 单角度
# ---------------------------------------------------------------------------

class PoseGalleryLoader:
    """选一个姿态（可选单一角度），输出图片 + 元信息。"""

    @classmethod
    def INPUT_TYPES(cls):
        try:
            store = _store()
            systems = [_ANY] + store.systems
            categories = [_ANY] + store.categories
            angles = [_ANY] + store.angles
        except GalleryError:
            systems, categories, angles = [_ANY], [_ANY], [_ANY]

        return {
            "required": {
                "gallery_root": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "tooltip": "留空则自动探测（config.json / 环境变量 POSE_GALLERY_ROOT）",
                }),
                "system": (systems, {"default": _ANY}),
                "category": (categories, {"default": _ANY}),
                "angle": (angles, {"default": _ANY}),
            },
            "optional": {
                "pose_id": ("STRING", {"default": "", "multiline": False,
                                       "tooltip": "精确指定姿态 id，留空则用上面的下拉筛选"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                # 前端图库选择器写入的 id（优先级最高）
                "selected_id": "STRING",
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("IMAGE", "META_JSON", "IMAGE_IDS", "PATHS", "NOTE")
    FUNCTION = "load"
    CATEGORY = "Pose Gallery"
    DESCRIPTION = "从姿态素材库取 1 张图（可先按系统/分类/角度筛选），输出图片与编号元信息。（⚠️ 未在真实 ComfyUI 测试，可能不稳定）"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # 选择变了就要重跑
        return json.dumps({
            k: kwargs.get(k) for k in
            ("gallery_root", "system", "category", "angle", "pose_id", "selected_id")
        }, ensure_ascii=False, sort_keys=True)

    def load(self, gallery_root="", system=_ANY, category=_ANY, angle=_ANY,
             pose_id="", selected_id="", unique_id=None, **kwargs):
        try:
            store = _store(gallery_root)
        except GalleryError as exc:
            return _empty_outputs(str(exc))

        sel = _split_ids(selected_id) or _split_ids(pose_id)
        ang = "" if angle in (_ANY, "", None) else str(angle)

        rows: List[Dict[str, Any]] = []
        if sel:
            # 显式指定了 id，就必须命中它；否则报错，不能静默退回「第一个匹配」
            unknown = [x for x in sel
                       if x not in store.by_pose_id and x not in store.by_image_id]
            if unknown:
                return _empty_outputs(
                    "找不到指定的 id：%s（请确认 pose_id / 编号拼写，或用面板重新选择）"
                    % "、".join(unknown[:5])
                )
            rows = _resolve_rows(store, sel, ang)
            if sel and not rows:
                return _empty_outputs(
                    "指定的 id 在角度「%s」上没有图片：%s" % (ang or "全部", "、".join(sel[:5]))
                )
        if not rows:
            found = store.query(
                system=None if system in (_ANY, "", None) else system,
                category=None if category in (_ANY, "", None) else category,
                angle=None if ang == "" else ang,
            )
            if found:
                rows = store.pose_images(found[0], ang or None)
        if not rows:
            return _empty_outputs("没有可用的图片（检查筛选条件或图库路径）")

        row = rows[0]
        try:
            image = load_image_tensor([row["full"]])
        except Exception as exc:
            return _empty_outputs("读取图片失败：%s" % exc)

        meta = _meta_of([row])
        note = "已选 %s｜%s" % (row["image_id"], row["name"])
        return (
            image,
            json.dumps(meta, ensure_ascii=False, indent=1),
            json.dumps([row["image_id"]], ensure_ascii=False),
            json.dumps([row["full"]], ensure_ascii=False),
            note,
        )


# ---------------------------------------------------------------------------
# 节点 2：同一姿态的整组角度
# ---------------------------------------------------------------------------

class PoseGalleryAngleSet:
    """取一个姿态的一组角度（默认 5 张），输出批次。"""

    @classmethod
    def INPUT_TYPES(cls):
        try:
            store = _store()
            systems = [_ANY] + store.systems
            categories = [_ANY] + store.categories
            angles = [_ANY] + store.angles
        except GalleryError:
            systems, categories, angles = [_ANY], [_ANY], [_ANY]

        return {
            "required": {
                "gallery_root": ("STRING", {"default": "", "multiline": False}),
                "system": (systems, {"default": _ANY}),
                "category": (categories, {"default": _ANY}),
                "angles": ("STRING", {
                    "default": "正面,上方,下方,侧面,斜侧",
                    "multiline": False,
                    "tooltip": "要包含的角度，逗号分隔；留空=该姿态的全部角度",
                }),
            },
            "optional": {
                "pose_id": ("STRING", {"default": "", "multiline": False,
                                       "tooltip": "精确指定姿态 id；留空则用下拉筛选取第一个匹配"}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "selected_id": "STRING"},
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("IMAGE", "META_JSON", "IMAGE_IDS", "PATHS", "NOTE")
    FUNCTION = "load"
    CATEGORY = "Pose Gallery"
    DESCRIPTION = "取同一姿态的多个角度（默认 5 张）作为批次，便于多视角参考。（⚠️ 未在真实 ComfyUI 测试，可能不稳定）"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return json.dumps({k: kwargs.get(k) for k in
                           ("gallery_root", "system", "category", "angles", "pose_id", "selected_id")},
                          ensure_ascii=False, sort_keys=True)

    def load(self, gallery_root="", system=_ANY, category=_ANY,
             angles="正面,上方,下方,侧面,斜侧", pose_id="", selected_id="", unique_id=None, **kwargs):
        try:
            store = _store(gallery_root)
        except GalleryError as exc:
            return _empty_outputs(str(exc))

        # 找目标姿态：优先前端选择 / pose_id，其次按筛选取第一个
        pose = None
        sel = _split_ids(selected_id) or _split_ids(pose_id)
        for item in sel:
            if item in store.by_pose_id:
                pose = store.by_pose_id[item]
                break
            hit = store.by_image_id.get(item)
            if hit:
                pose = hit[0]
                break
        if sel and pose is None:
            # 显式指定了 id 却找不到 → 明确报错，不静默退回筛选结果
            return _empty_outputs(
                "找不到指定的 id：%s（请确认 pose_id / 编号拼写，或用面板重新选择）"
                % "、".join(sel[:5])
            )
        if pose is None:
            found = store.query(
                system=None if system in (_ANY, "", None) else system,
                category=None if category in (_ANY, "", None) else category,
            )
            if found:
                pose = found[0]
        if pose is None:
            return _empty_outputs("没有匹配的姿态（检查筛选条件或图库路径）")

        want = [a.strip() for a in str(angles or "").replace("、", ",").split(",") if a.strip()]
        rows = store.pose_images(pose)
        if want:
            rows = [r for r in rows if r["angle"] in want]
        if not rows:
            return _empty_outputs("该姿态在指定角度上没有图片：%s" % (angles or ""))

        try:
            image = load_image_tensor([r["full"] for r in rows])
        except Exception as exc:
            return _empty_outputs("读取图片失败：%s" % exc)

        meta = _meta_of(rows)
        note = "%s｜%s｜%d 个角度：%s" % (
            pose.get("pose_id"), pose.get("name"), len(rows),
            "、".join(r["angle"] for r in rows),
        )
        return (
            image,
            json.dumps(meta, ensure_ascii=False, indent=1),
            json.dumps([r["image_id"] for r in rows], ensure_ascii=False),
            json.dumps([r["full"] for r in rows], ensure_ascii=False),
            note,
        )


# ---------------------------------------------------------------------------
# 节点 3：批量（多分类 / 多姿态）
# ---------------------------------------------------------------------------

class PoseGalleryBatchLoader:
    """按系统/分类/关键词批量取图，可指定每姿态取哪些角度。"""

    @classmethod
    def INPUT_TYPES(cls):
        try:
            store = _store()
            systems = [_ANY] + store.systems
            categories = [_ANY] + store.categories
            angles = [_ANY] + store.angles
        except GalleryError:
            systems, categories, angles = [_ANY], [_ANY], [_ANY]

        return {
            "required": {
                "gallery_root": ("STRING", {"default": "", "multiline": False}),
                "system": (systems, {"default": _ANY}),
                "category": (categories, {"default": _ANY}),
                "angle": (angles, {"default": "正面",
                                   "tooltip": "每个姿态取哪个角度；选「(任意)」= 该姿态的全部角度"}),
                "limit": ("INT", {"default": 8, "min": 1, "max": 128, "step": 1,
                                  "tooltip": "最多取多少个姿态"}),
                "offset": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
            },
            "optional": {
                "query": ("STRING", {"default": "", "multiline": False,
                                     "tooltip": "关键词：在名称 / 编号 / 系统 / 分类里匹配"}),
                "pose_ids": ("STRING", {
                    "default": "", "multiline": True,
                    "tooltip": "直接指定姿态 id（逗号或换行分隔），填了就忽略上面的筛选",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "selected_id": "STRING"},
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("IMAGE", "META_JSON", "IMAGE_IDS", "PATHS", "NOTE")
    FUNCTION = "load"
    CATEGORY = "Pose Gallery"
    DESCRIPTION = "批量取图（可跨分类 / 多姿态），输出批次与严格对齐的元信息列表。（⚠️ 未在真实 ComfyUI 测试，可能不稳定）"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return json.dumps({k: kwargs.get(k) for k in
                           ("gallery_root", "system", "category", "angle",
                            "limit", "offset", "query", "pose_ids", "selected_id")},
                          ensure_ascii=False, sort_keys=True)

    def load(self, gallery_root="", system=_ANY, category=_ANY, angle="正面",
             limit=8, offset=0, query="", pose_ids="", selected_id="", unique_id=None, **kwargs):
        try:
            store = _store(gallery_root)
        except GalleryError as exc:
            return _empty_outputs(str(exc))

        ang = "" if angle in (_ANY, "", None) else str(angle)
        rows: List[Dict[str, Any]] = []

        picks = _split_ids(selected_id) or _split_ids(pose_ids)
        if picks:
            # 显式指定了 id 就必须全部命中，避免「填错了却悄悄出了一批别的图」
            unknown = [x for x in picks
                       if x not in store.by_pose_id and x not in store.by_image_id]
            if unknown:
                return _empty_outputs(
                    "找不到指定的 id：%s（请确认 pose_id / 编号拼写，或用面板重新选择）"
                    % "、".join(unknown[:5])
                )
            for item in picks:
                if item in store.by_pose_id:
                    rows.extend(store.pose_images(store.by_pose_id[item], ang or None))
                else:
                    hit = store.by_image_id.get(item)
                    if hit:
                        rows.extend(store.pose_images(hit[0], hit[1]))
        else:
            found = store.query(
                q=query or None,
                system=None if system in (_ANY, "", None) else system,
                category=None if category in (_ANY, "", None) else category,
                angle=None if ang == "" else ang,
            )
            found = found[int(offset): int(offset) + int(limit)]
            for pose in found:
                rows.extend(store.pose_images(pose, ang or None))

        # 去重 + 应用上限（批次数按图片算，避免一次吃爆显存）
        seen, uniq = set(), []
        for r in rows:
            if r["image_id"] in seen:
                continue
            seen.add(r["image_id"])
            uniq.append(r)
        rows = uniq[: max(1, int(limit)) * max(1, len(store.angles or [1]))]
        if not rows:
            return _empty_outputs("没有匹配的图片（检查筛选条件或图库路径）")

        try:
            image = load_image_tensor([r["full"] for r in rows])
        except Exception as exc:
            return _empty_outputs("读取图片失败：%s" % exc)

        meta = _meta_of(rows)
        note = "批次 %d 张｜%d 个姿态｜角度：%s" % (
            len(rows), len({r["pose_id"] for r in rows}), ang or "全部",
        )
        return (
            image,
            json.dumps(meta, ensure_ascii=False, indent=1),
            json.dumps([r["image_id"] for r in rows], ensure_ascii=False),
            json.dumps([r["full"] for r in rows], ensure_ascii=False),
            note,
        )


# ---------------------------------------------------------------------------
# 辅助节点：读取任意一个输出里的单张图片（便于链路串联）
# ---------------------------------------------------------------------------

class PoseGalleryPickOne:
    """从批次里挑第 index 张（配合其它节点只吃单张图时使用）。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "index": ("INT", {"default": 0, "min": 0, "max": 4095, "step": 1}),
            },
            "optional": {
                "meta_json": ("STRING", {"forceInput": True}),
                "image_ids": ("STRING", {"forceInput": True}),
                "paths": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("IMAGE", "META_JSON", "IMAGE_ID", "PATH")
    FUNCTION = "pick"
    CATEGORY = "Pose Gallery"
    DESCRIPTION = "从批次中按序号取单张，并同步取出对应的元信息 / 编号 / 路径。（⚠️ 未在真实 ComfyUI 测试，可能不稳定）"

    def pick(self, image, index=0, meta_json="", image_ids="", paths=""):
        try:
            n = int(image.shape[0])
        except Exception:
            n = 1
        if n <= 0:
            return (_blank_image(), "[]", "", "")
        i = max(0, min(int(index), n - 1))

        def _at(raw: str, default: str = "") -> str:
            items = _split_ids(raw)
            return items[i] if i < len(items) else default

        meta_items = []
        try:
            parsed = json.loads(meta_json) if meta_json else []
            if isinstance(parsed, list):
                meta_items = parsed
        except Exception:
            meta_items = []
        one_meta = meta_items[i] if i < len(meta_items) else {}

        single = image[i:i + 1] if hasattr(image, "__getitem__") else image
        return (
            single,
            json.dumps(one_meta, ensure_ascii=False, indent=1),
            _at(image_ids),
            _at(paths),
        )


# ---------------------------------------------------------------------------
# 注册表
# ---------------------------------------------------------------------------

NODE_CLASS_MAPPINGS = {
    "PoseGalleryLoader": PoseGalleryLoader,
    "PoseGalleryAngleSet": PoseGalleryAngleSet,
    "PoseGalleryBatchLoader": PoseGalleryBatchLoader,
    "PoseGalleryPickOne": PoseGalleryPickOne,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PoseGalleryLoader": "姿态库 · 单张",
    "PoseGalleryAngleSet": "姿态库 · 角度组（5 角度）",
    "PoseGalleryBatchLoader": "姿态库 · 批量",
    "PoseGalleryPickOne": "姿态库 · 从批次取单张",
}

/* Pose Gallery —— 节点挂载、选择状态与内联线稿预览

 * 从 pose_gallery.js 拆出。
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { t, onLangChange } from "./pose_gallery_i18n.js";
import { NODE_NAMES } from "./pose_gallery_shared.js";
import { PickerPanel } from "./pose_gallery_panel.js";

async function apiJson(path) {
  const res = await api.fetchApi(path);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* 节点挂载                                                           */
/* ------------------------------------------------------------------ */

const HIDDEN_NAME = "selected_id";

function ensureHiddenWidget(node) {
  let w = node.widgets && node.widgets.find((x) => x.name === HIDDEN_NAME);
  if (w) {
    /* 旧版本可能已建出可见输入框，这里兜底移除 */
    if (w.element && w.element.parentElement) {
      w.element.parentElement.removeChild(w.element);
    }
    w.element = undefined;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    w.type = "hidden";
    return w;
  }
  /* 纯数据 widget：不创建 DOM、不绘制、不占高度，但仍参与工作流序列化。
     不能用 addWidget("text")——新版 ComfyUI 会把它渲染成可见输入框，
     把内部 JSON 明文显示在节点上。 */
  w = {
    name: HIDDEN_NAME,
    type: "hidden",
    value: "",
    options: { serialize: true },
    serialize: true,
    computeSize: () => [0, -4],
    draw: () => {},
    mouse: () => false,
  };
  node.widgets.push(w);
  return w;
}

function selectedOf(node) {
  const w = node.widgets && node.widgets.find((x) => x.name === HIDDEN_NAME);
  if (!w || !w.value) return [];
  try {
    const v = JSON.parse(w.value);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return String(w.value).split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function paintSelection(node) {
  const ids = selectedOf(node);
  if (!node._pgBadge) return;
  /* 已选时不再重复显示数量——下方预览图本身已带 pose_id 标签；
     只在「未选择」时给一行提示。 */
  if (ids.length) {
    node._pgBadge.textContent = "";
    node._pgBadge.style.display = "none";
  } else {
    node._pgBadge.textContent = t("notSelected");
    node._pgBadge.style.display = "";
    node._pgBadge.style.color = "#7d8592";
  }
  renderNodePreview(node);
  syncPickerWrapHeight(node);
}

/** pg_picker 是 DOM widget，内容为空时把它压成 0 高度，避免节点中出现大片空白 */
function syncPickerWrapHeight(node) {
  const wrap = node._pgWrap;
  if (!wrap) return;
  const badgeOn = !!(node._pgBadge && node._pgBadge.textContent &&
                     node._pgBadge.style.display !== "none");
  const prevOn = !!(node._pgPreview && node._pgPreview.style.display !== "none" &&
                    node._pgPreview.children.length);
  wrap.style.height = (badgeOn || prevOn) ? "auto" : "0px";
  wrap.style.overflow = (badgeOn || prevOn) ? "visible" : "hidden";
}
/* ------------------------------------------------------------------ */
/* 节点内联线稿预览                                                    */
/* ------------------------------------------------------------------ */

/* 姿态 id → 可选角度列表由面板回填；这里只缓存已解析结果 */
const POSE_IMAGES_CACHE = new Map();

async function fetchPoseImages(poseId) {
  if (POSE_IMAGES_CACHE.has(poseId)) return POSE_IMAGES_CACHE.get(poseId);
  try {
    const data = await apiJson("/pose_gallery/pose/" + encodeURIComponent(poseId));
    const imgs = (data && data.pose && data.pose.images) || [];
    POSE_IMAGES_CACHE.set(poseId, imgs);
    return imgs;
  } catch (e) {
    return [];
  }
}

/**
 * 在节点 DOM 上直接渲染已选姿态的线稿缩略图（3:4）。
 * 单选显示 1 张，批量节点显示最多 4 张并标注 +N。
 */
async function renderNodePreview(node) {
  const host = node._pgPreview;
  if (!host) return;
  const ids = selectedOf(node);
  host.innerHTML = "";
  if (!ids.length) {
    host.style.display = "none";
    fitNodePreview(node, 0);
    syncPickerWrapHeight(node);
    return;
  }
  host.style.display = "flex";

  /* 逐个姿态取首张（正面角度）作为线稿预览 */
  const items = [];
  for (const pid of ids.slice(0, 4)) {
    const imgs = await fetchPoseImages(pid);
    const cover = imgs.find((x) => x.angle === "正面") || imgs[0];
    items.push({ pid, url: cover ? cover.thumb_url : "" });
  }

  /* 预览尺寸：按节点宽度决定每行几列，保持 3:4 */
  const nodeW = node.size ? node.size[0] : 270;
  const availW = Math.max(80, nodeW - 32);
  const GAP = 8;
  const n = items.length;
  const MAX_THUMB = 150;      /* 单张最大 150px 宽，避免只有 1 张时被撑得过大 */
  const MIN_THUMB = 70;
  /* 从「每行最多 4 张」往下试，选能放下且缩略图不小于 MIN_THUMB 的方案 */
  let cols = Math.min(n, 4);
  while (cols > 1) {
    const w = Math.floor((availW - (cols - 1) * GAP) / cols);
    if (w >= MIN_THUMB) break;
    cols--;
  }
  let W = Math.floor((availW - (cols - 1) * GAP) / cols);
  W = Math.max(MIN_THUMB, Math.min(MAX_THUMB, W));   /* 同时限上下界 */
  const H = Math.round((W * 4) / 3);   /* 严格 3:4 */
  host.style.gap = GAP + "px";
  host.style.flexWrap = "wrap";
  host.style.maxWidth = availW + "px";

  for (const it of items) {
    const cell = document.createElement("div");
    cell.style.cssText =
      "position:relative;width:" + W + "px;height:" + H + "px;border-radius:8px;overflow:hidden;" +
      "background:#f2f2f0;border:1px solid #2a303a;flex:0 0 auto";
    if (it.url) {
      const im = document.createElement("img");
      im.src = it.url;
      im.alt = it.pid;
      im.style.cssText =
        "width:100%;height:100%;aspect-ratio:3 / 4;object-fit:cover;object-position:center top;display:block";
      cell.append(im);
    }
    const tag = document.createElement("div");
    tag.textContent = it.pid;
    tag.style.cssText =
      "position:absolute;left:0;right:0;bottom:0;padding:2px 5px;font-size:9.5px;" +
      "color:#dfe4ec;background:rgba(10,12,16,.72);overflow:hidden;" +
      "text-overflow:ellipsis;white-space:nowrap";
    cell.append(tag);
    host.append(cell);
  }

  if (ids.length > 4) {
    const more = document.createElement("div");
    more.textContent = "+" + (ids.length - 4);
    more.style.cssText =
      "align-self:center;font-size:12px;color:#8fb4ff;padding:0 6px";
    host.append(more);
  }

  /* 关键：按「实际行数」算高度，避免第二行溢出节点 */
  const shown = Math.min(items.length, 4) + (ids.length > 4 ? 1 : 0);
  const rows = Math.max(1, Math.ceil(shown / cols));
  const totalH = rows * H + (rows - 1) * GAP;
  fitNodePreview(node, totalH);
  syncPickerWrapHeight(node);
}

/** 让节点高度包住预览区，避免图被裁掉 */
function fitNodePreview(node, previewH) {
  if (!node || !node.size) return;
  /* 预览高度 + 上下内边距 8 + 余量 20（防止裁切） */
  const extra = previewH ? previewH + 8 + 20 : 0;
  if (node._pgPreviewBase === undefined) {
    node._pgPreviewBase = node.size[1];
  }
  const want = node._pgPreviewBase + extra;
  if (Math.abs((node.size[1] || 0) - want) > 2) {
    node.size[1] = want;
    node.setDirtyCanvas(true, true);
  }
}

/** 语言切换后刷新所有已创建节点的按钮文字与状态标签 */
function relabelNodes() {
  const nodes = (app.graph && app.graph._nodes) || [];
  for (const node of nodes) {
    if (!NODE_NAMES.includes(node.comfyClass)) continue;
    if (node._pgRelabel) node._pgRelabel();
  }
}
app.registerExtension({
  name: "PoseGallery.Picker",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODE_NAMES.includes(nodeData.name)) return;

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated ? onCreated.apply(this, arguments) : undefined;
      const node = this;

      /* 先记录「无预览时的自然高度」作为基准，供 fitNodePreview 使用。
         必须在折叠 pg_picker 之前记录，否则基准会偏小。 */
      node._pgPreviewBase = node.size ? node.size[1] : undefined;

      ensureHiddenWidget(node);

      /* 选中状态标签（仅在未选择时显示一行提示，选中后隐藏避免与预览图重复） */
      const badge = document.createElement("div");
      badge.style.cssText =
        "font-size:11px;color:#7d8592;padding:2px 0 4px;word-break:break-all";
      node._pgBadge = badge;

      /* 线稿预览容器（直接嵌在节点上，选中后即时显示） */
      const preview = document.createElement("div");
      preview.style.cssText =
        "display:none;flex-wrap:wrap;align-items:flex-start;padding:2px 0 6px;" +
        "max-width:640px";
      node._pgPreview = preview;

      /* ComfyUI 新版用 addDOMWidget 承载自定义 DOM */
      if (node.addDOMWidget) {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "display:flex;flex-direction:column;gap:2px;height:0;overflow:hidden";
        wrap.append(badge, preview);
        node._pgWrap = wrap;
        const dom = node.addDOMWidget("pg_picker", "pg_picker", wrap, {
          getValue: () => selectedOf(node).join(","),
          setValue: () => {},
          hideOnZoom: false,
        });
        if (dom) dom.serialize = false;
      }

      /* 打开图库选择 → 选完直接把线稿展示在节点上 */
      const btnOpen = node.addWidget("button", t("btnOpenPicker"), null, () => {
        const panel = new PickerPanel(node, (ids) => {
          const w = ensureHiddenWidget(node);
          w.value = JSON.stringify(ids);
          paintSelection(node);          // 内部已调用 renderNodePreview，选完即出图
          node.setDirtyCanvas(true, true);
        });
        panel.init().then(() => {
          /* 回填已选项 */
          for (const id of selectedOf(node)) panel.selected.add(id);
          panel._render();
        });
      });

      const btnShow = node.addWidget("button", t("btnShowSketch"), null, () => {
        renderNodePreview(node);
        node.setDirtyCanvas(true, true);
      });

      const btnClear = node.addWidget("button", t("btnClear"), null, () => {
        const w = ensureHiddenWidget(node);
        w.value = "";
        paintSelection(node);
        node.setDirtyCanvas(true, true);
      });

      /* 供语言切换时调用 */
      node._pgRelabel = () => {
        if (btnOpen) btnOpen.name = t("btnOpenPicker");
        if (btnShow) btnShow.name = t("btnShowSketch");
        if (btnClear) btnClear.name = t("btnClear");
        paintSelection(node);
        node.setDirtyCanvas(true, true);
      };

      paintSelection(node);
      /* 首帧渲染后，把「已折叠、无预览」的稳定高度固化为基准。
         此后无论怎么选/清空，节点高度都围绕这个基准变化。 */
      requestAnimationFrame(() => {
        syncPickerWrapHeight(node);
        node._pgPreviewBase = node.size ? node.size[1] : undefined;
      });
      return r;
    };

    /* 从工作流读回来时刷新显示 */
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
      paintSelection(this);
      return r;
    };
  },
});

/* 语言切换时，刷新画布上所有本插件节点 */
onLangChange(() => relabelNodes());

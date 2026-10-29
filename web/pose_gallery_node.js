/* Pose Gallery —— 节点挂载、选择状态与内联线稿预览

 * 从 pose_gallery.js 拆出。
 *
 * 重要设计决定（2026-10-29）：
 *   节点上的线稿预览与下载状态行改为 **canvas 自绘**，不再使用 DOM widget。
 *   原因：ComfyUI 的 .dom-widget 是 position:fixed，其 top/height 由内部 Vue
 *   从 widget.computeSize() 与节点几何推导；多个 DOM widget 会互相挤压，
 *   且节点高度变化后定位不刷新，导致预览图盖住参数行。canvas 自绘在同一套
 *   坐标里排版，与参数行天然不会重叠。
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
    w.computeSize = () => [0, 0];
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
    computeSize: () => [0, 0],
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

/* ------------------------------------------------------------------ */
/* 预览数据（canvas 自绘用）                                           */
/* ------------------------------------------------------------------ */

const PREV_W = 90;              /* 线稿固定宽 */
const PREV_H = 120;             /* 线稿固定高（3:4） */
const PREV_GAP = 8;
const PREV_PAD = 6;             /* 预览区上下内边距 */
const CAP_H = 14;               /* 图片下方 id 标签高度 */

/* 姿态 id → 已解析的角度列表 */
const POSE_IMAGES_CACHE = new Map();
/* image_id → 已加载的 HTMLImageElement */
const IMG_CACHE = new Map();

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

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (IMG_CACHE.has(url)) return Promise.resolve(IMG_CACHE.get(url));
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => { IMG_CACHE.set(url, im); resolve(im); };
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

/**
 * 重新解析选中项 → 加载线稿 → 触发布局重算 + 重绘。
 * node._pgItems = [{pid, img}]，供 drawNodePreview 使用。
 */
async function refreshPreviewData(node) {
  const ids = selectedOf(node);
  const items = [];
  for (const pid of ids.slice(0, 4)) {
    const imgs = await fetchPoseImages(pid);
    const cover = imgs.find((x) => x.angle === "正面") || imgs[0];
    const img = cover ? await loadImage(cover.thumb_url) : null;
    items.push({ pid, img });
  }
  node._pgItems = items;
  node._pgOverflow = Math.max(0, ids.length - 4);
  relayoutNode(node);
}

/* ------------------------------------------------------------------ */
/* 布局：节点高度按「基准 + 预览区高度」计算                            */
/* ------------------------------------------------------------------ */

/** 预览区 + 状态行总高度 */
function previewBlockHeight(node) {
  const gridH = previewGridHeight(node);
  const hasItems = (node._pgItems || []).length > 0;
  const statusH = node._pgDlText ? 18 : 0;
  if (!hasItems) {
    /* 未选时只有「未选择」提示 + 状态行 */
    return (node._pgDlText ? 22 : 22) + statusH;
  }
  return gridH + PREV_PAD * 2 + statusH;
}

/** 让节点高度包住预览区；无预览时回到基准高度 */
function fitNodePreview(node) {
  if (!node || !node.size) return;
  if (node._pgPreviewBase === undefined) {
    node._pgPreviewBase = node.size[1];
  }
  const want = node._pgPreviewBase + previewBlockHeight(node);
  if (Math.abs((node.size[1] || 0) - want) > 1) {
    node.size[1] = want;
  }
  if (app && app.canvas) app.canvas.setDirty(true, true);
}

/** 高度变化后触发重排与重绘 */
function relayoutNode(node) {
  if (!node) return;
  fitNodePreview(node);
  if (typeof node.setSize === "function" && node.size) {
    try { node.setSize([node.size[0], node.size[1]]); } catch (e) { /* ignore */ }
  }
  if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
  if (app && app.canvas) app.canvas.setDirty(true, true);
}

/**
 * canvas 自绘：线稿预览 + 下载状态行。
 * 绘制区域锚定在节点「底部预留空间」内（fitNodePreview 把这部分高度加在最下方），
 * 所以不会盖住上面的参数行。
 */
function drawNodePreview(node, ctx) {
  if (!ctx) return;
  const items = node._pgItems || [];
  const nodeW = node.size ? node.size[0] : 300;
  const blockH = previewBlockHeight(node);
  /* 预留区起点：节点底部往上 blockH */
  const baseY = Math.max(0, (node.size ? node.size[1] : 0) - blockH);

  /* 未选择：一行灰字提示 */
  if (!items.length) {
    ctx.save();
    ctx.fillStyle = "#7d8592";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(t("notSelected"), 10, baseY + 2);
    ctx.restore();
    drawDownloadStatus(node, ctx, baseY + 20);
    return;
  }

  ctx.save();
  const startY = baseY + PREV_PAD;
  const availW = Math.max(80, nodeW - 24);
  const cols = Math.max(1, Math.floor((availW + PREV_GAP) / (PREV_W + PREV_GAP)));

  items.forEach((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = 10 + c * (PREV_W + PREV_GAP);
    const y = startY + r * (PREV_H + CAP_H + PREV_GAP);

    /* 底板 */
    ctx.fillStyle = "#f2f2f0";
    ctx.fillRect(x, y, PREV_W, PREV_H);
    /* 线稿 */
    if (it.img && it.img.width) {
      ctx.drawImage(it.img, x, y, PREV_W, PREV_H);
    }
    /* 边框 */
    ctx.strokeStyle = "#2a303a";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, PREV_W - 1, PREV_H - 1);
  });

  /* 超出 4 张的 +N 提示 */
  if ((node._pgOverflow || 0) > 0) {
    const idx = items.length;
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x = 10 + c * (PREV_W + PREV_GAP);
    const y = startY + r * (PREV_H + CAP_H + PREV_GAP);
    ctx.fillStyle = "#8fb4ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("+" + node._pgOverflow, x, y + 4);
  }
  ctx.restore();

  /* 状态行紧接在预览区下方 */
  drawDownloadStatus(node, ctx, startY + previewGridHeight(node) + 4);
}

/** 下载状态行：画在预览区下方（同一行显示提示与数量） */
function drawDownloadStatus(node, ctx, top) {
  const text = node._pgDlText;
  if (!text) return;
  const nodeW = node.size ? node.size[0] : 300;
  ctx.save();
  ctx.fillStyle = node._pgDlColor || "#e0a03c";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let shown = text;
  while (ctx.measureText(shown).width > nodeW - 20 && shown.length > 6) {
    shown = shown.slice(0, -1);
  }
  ctx.fillText(shown, 10, top);
  ctx.restore();
}

/** 预览网格高度（不含上下内边距） */
function previewGridHeight(node) {
  const items = node._pgItems || [];
  if (!items.length) return 0;
  const nodeW = node.size ? node.size[0] : 300;
  const availW = Math.max(80, nodeW - 24);
  const cols = Math.max(1, Math.floor((availW + PREV_GAP) / (PREV_W + PREV_GAP)));
  const shown = Math.min(items.length, 4) + ((node._pgOverflow || 0) > 0 ? 1 : 0);
  const rows = Math.max(1, Math.ceil(shown / cols));
  return rows * (PREV_H + CAP_H) + (rows - 1) * PREV_GAP;
}

/* ------------------------------------------------------------------ */
/* 多行输入框高度限制                                                  */
/* ------------------------------------------------------------------ */

const MULTILINE_ROWS = 2;
const MULTILINE_LINE_H = 18;

/** 把多行 STRING 控件（pose_ids / angles）压到两行高度 */
function shrinkMultilineWidgets(node) {
  if (!node || !node.widgets) return;
  const targets = ["pose_ids", "angles"];
  const capH = MULTILINE_ROWS * MULTILINE_LINE_H + 12;
  for (const w of node.widgets) {
    if (!targets.includes(w.name)) continue;
    w.computeSize = function (width) {
      return [width || (node.size ? node.size[0] : 300), capH];
    };
    const el = w.inputEl || w.element;
    if (el && el.style) {
      el.style.height = capH + "px";
      el.style.minHeight = capH + "px";
      el.style.maxHeight = capH + "px";
      el.style.overflowY = "auto";
      el.style.lineHeight = MULTILINE_LINE_H + "px";
    }
  }
}

/* ------------------------------------------------------------------ */
/* 节点注册                                                            */
/* ------------------------------------------------------------------ */

function paintSelection(node) {
  refreshPreviewData(node);
}

/** 语言切换后刷新所有已创建节点 */
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

      ensureHiddenWidget(node);
      node._pgItems = [];
      node._pgOverflow = 0;

      /* 打开图库选择 → 选完直接把线稿画到节点上 */
      const btnOpen = node.addWidget("button", t("btnOpenPicker"), null, () => {
        const panel = new PickerPanel(node, (ids) => {
          const w = ensureHiddenWidget(node);
          w.value = JSON.stringify(ids);
          paintSelection(node);
          node.setDirtyCanvas(true, true);
        });
        panel.init().then(() => {
          for (const id of selectedOf(node)) panel.selected.add(id);
          panel._render();
        });
      });

      const btnShow = node.addWidget("button", t("btnShowSketch"), null, () => {
        refreshPreviewData(node);
      });

      const btnClear = node.addWidget("button", t("btnClear"), null, () => {
        const w = ensureHiddenWidget(node);
        w.value = "";
        paintSelection(node);
        node.setDirtyCanvas(true, true);
      });

      node._pgRelabel = () => {
        if (btnOpen) btnOpen.name = t("btnOpenPicker");
        if (btnShow) btnShow.name = t("btnShowSketch");
        if (btnClear) btnClear.name = t("btnClear");
        paintSelection(node);        /* 重新解析选中项并重排，确保外部改 selected_id 后也能刷新 */
        node.setDirtyCanvas(true, true);
      };

      /* canvas 自绘预览 */
      const onDraw = node.onDrawForeground;
      node.onDrawForeground = function (ctx) {
        const rr = onDraw ? onDraw.apply(this, arguments) : undefined;
        drawNodePreview(node, ctx);
        return rr;
      };

      shrinkMultilineWidgets(node);
      paintSelection(node);

      /* 首帧后把「无预览」的稳定高度固化为基准 */
      requestAnimationFrame(() => {
        shrinkMultilineWidgets(node);
        node._pgPreviewBase = node.size ? node.size[1] : undefined;
        relayoutNode(node);
      });
      return r;
    };

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

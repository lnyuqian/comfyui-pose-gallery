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

/* ------------------------------------------------------------------ */
/* 布局槽位：预览占位 + 高度计算                                        */
/* ------------------------------------------------------------------ */

/**
 * 在 ③ 展示线稿图 之后插入一个「预览占位槽」。
 * 占位槽自身参与 litegraph 的高度计算，因此线稿会自然出现在
 * ③ 按钮下方、下载按钮上方，不需要手工改 node.size。
 */
function ensurePreviewSpacer(node) {
  if (node._pgSpacer) return node._pgSpacer;
  const spacer = {
    name: "pg_preview_spacer",
    type: "pg_spacer",
    value: "",
    serialize: false,
    computeSize: function (width) {
      return [width || node.size[0], previewGridHeight(node) + PREV_PAD * 2];
    },
    draw: function () { /* 由 onDrawForeground 统一绘制 */ },
    mouse: () => false,
  };
  node._pgSpacer = spacer;

  /* 插到 ③ 展示线稿图 后面 */
  const showIdx = (node.widgets || []).findIndex(
    (w) => w.name === t("btnShowSketch")
  );
  if (showIdx >= 0) node.widgets.splice(showIdx + 1, 0, spacer);
  else node.widgets.push(spacer);
  return spacer;
}

/** 把占位槽挪到 ③ 展示线稿图 之后（语言切换后按钮名会变，需要重定位） */
function pinSpacerAfterShow(node) {
  const spacer = node._pgSpacer;
  if (!spacer || !node.widgets) return;
  const cur = node.widgets.indexOf(spacer);
  if (cur >= 0) node.widgets.splice(cur, 1);
  const btn = node.widgets.find((w) => w.name === t("btnShowSketch"));
  const idx = btn ? node.widgets.indexOf(btn) : node.widgets.length - 1;
  node.widgets.splice(idx + 1, 0, spacer);
}

/* ① 打开图库选择 上方留白（像素） */
const GAP_BEFORE_PICKER = 15;

/**
 * 在「① 打开图库选择」之前插入一个纯高度占位槽，
 * 把按钮组整体往下推 15px，与上方参数区拉开距离。
 */
function ensureTopGap(node) {
  if (node._pgTopGap) return node._pgTopGap;
  const gap = {
    name: "pg_top_gap",
    type: "pg_gap",
    value: "",
    serialize: false,
    computeSize: function (width) {
      return [width || node.size[0], GAP_BEFORE_PICKER];
    },
    draw: function () { /* 纯留白，不绘制 */ },
    mouse: () => false,
  };
  node._pgTopGap = gap;
  const idx = (node.widgets || []).findIndex((w) => w.name === t("btnOpenPicker"));
  if (idx >= 0) node.widgets.splice(idx, 0, gap);
  else node.widgets.push(gap);
  return gap;
}

/** 语言切换后把占位槽重新插回 ① 之前（按钮名会变） */
function pinTopGapBeforePicker(node) {
  const gap = node._pgTopGap;
  if (!gap || !node.widgets) return;
  const cur = node.widgets.indexOf(gap);
  if (cur >= 0) node.widgets.splice(cur, 1);
  const btn = node.widgets.find((w) => w.name === t("btnOpenPicker"));
  const idx = btn ? node.widgets.indexOf(btn) : 0;
  node.widgets.splice(idx, 0, gap);
}

/**
 * 底部状态行与下载按钮同行绘制，不再需要独立占位槽。
 * 保留空实现以兼容调用点。
 */
function ensureStatusSpacer(node) {
  return node._pgStatusSpacer;
}

/**
 * 底部状态行不再单独占一行（与下载按钮同行绘制），
 * 保留该函数以兼容旧调用点，直接同步布局即可。
 */
function pinStatusSpacerLast(node) {
  const sp = node._pgStatusSpacer;
  if (!sp || !node.widgets) return;
  /* 若历史上插过占位槽，这里把它移除 */
  const i = node.widgets.indexOf(sp);
  if (i >= 0) node.widgets.splice(i, 1);
  node._pgStatusSpacer = undefined;
}

/**
 * 把下载按钮挪到 widget 列表最后一位。
 * Downloader 扩展的 onNodeCreated 可能先于 Picker 执行，导致按钮被插在前面。
 */
function pinDownloadButtonLast(node) {
  if (!node || !node.widgets) return;
  const btn = node._pgDlBtn ||
    node.widgets.find((w) => w.type === "button" &&
      (w.name === t("btnDownload") || w.name === t("btnDownloaded")));
  if (!btn) return;
  /* 下载按钮 -> 状态行占位槽 的顺序：按钮先，占位槽后 */
  const i = node.widgets.indexOf(btn);
  const sp = node._pgStatusSpacer;
  if (i >= 0) node.widgets.splice(i, 1);
  node.widgets.push(btn);
  if (sp) {
    const j = node.widgets.indexOf(sp);
    if (j >= 0) node.widgets.splice(j, 1);
    node.widgets.push(sp);
  }
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
  return rows * PREV_H + (rows - 1) * PREV_GAP;
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

/** 节点高度由占位槽自然撑开；这里只负责把占位槽尺寸同步给 litegraph 并重绘 */
function fitNodePreview(node) {
  const spacer = node._pgSpacer;
  if (spacer) {
    spacer.computeSize = function (width) {
      return [width || node.size[0], previewGridHeight(node) + PREV_PAD * 2];
    };
  }
  if (app && app.canvas) app.canvas.setDirty(true, true);
}

/**
 * canvas 自绘：线稿预览（画在占位槽位置）+ 下载状态（画在最底部按钮那一行）。
 */
function drawNodePreview(node, ctx) {
  if (!ctx) return;
  const items = node._pgItems || [];
  const nodeW = node.size ? node.size[0] : 300;
  const spacer = node._pgSpacer;

  /* 预览区起点 = 占位槽的 y（即 ③ 按钮下一行） */
  if (!items.length) {
    drawDownloadStatus(node, ctx);
    return;
  }
  const startY = spacer && spacer.last_y !== undefined
    ? spacer.last_y + PREV_PAD
    : 10;

  ctx.save();
  const availW = Math.max(80, nodeW - 24);
  const cols = Math.max(1, Math.floor((availW + PREV_GAP) / (PREV_W + PREV_GAP)));

  items.forEach((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = 10 + c * (PREV_W + PREV_GAP);
    const y = startY + r * (PREV_H + PREV_GAP);

    ctx.fillStyle = "#f2f2f0";
    ctx.fillRect(x, y, PREV_W, PREV_H);
    if (it.img && it.img.width) {
      ctx.drawImage(it.img, x, y, PREV_W, PREV_H);
    }
    ctx.strokeStyle = "#2a303a";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, PREV_W - 1, PREV_H - 1);
  });

  if ((node._pgOverflow || 0) > 0) {
    const idx = items.length;
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x = 10 + c * (PREV_W + PREV_GAP);
    const y = startY + r * (PREV_H + PREV_GAP);
    ctx.fillStyle = "#8fb4ff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("+" + node._pgOverflow, x, y + 4);
  }
  ctx.restore();

  drawDownloadStatus(node, ctx);
}

/**
 * 下载状态：与「最下面那个卡槽」（下载按钮）同一行，靠左绘制。
 * 按钮文字居中，左侧留白正好放状态文字，互不重叠。
 */
function drawDownloadStatus(node, ctx) {
  const text = node._pgDlText;
  if (!text) return;
  const nodeW = node.size ? node.size[0] : 300;

  /* 取下载按钮所在行（最底部那个卡槽） */
  let rowY = null;
  const dlBtn = (node.widgets || []).find((w) => w.type === "button" &&
    (w.name === t("btnDownload") || w.name === t("btnDownloaded")));
  if (dlBtn && dlBtn.last_y !== undefined) {
    rowY = dlBtn.last_y;
  }
  if (rowY === null) {
    rowY = Math.max(0, (node.size ? node.size[1] : 0) - 30);
  }
  /* 按钮默认行高按 24~26px 估算，居中绘制 */
  const rowH = 26;

  ctx.save();
  ctx.fillStyle = node._pgDlColor || "#e0a03c";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  /* 按钮文字居中，左侧留白足够放状态文字；只避开中央按钮标签区 */
  const maxW = Math.max(120, nodeW - 160);
  let shown = text;
  while (ctx.measureText(shown).width > maxW && shown.length > 6) {
    shown = shown.slice(0, -1);
  }
  ctx.fillText(shown, 10, rowY + rowH / 2);
  ctx.restore();
}

/** 状态行高度（需要在节点高度里预留） */
const STATUS_ROW_H = 22;

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

      /* ① 打开图库选择 → 选完直接把线稿画到节点上 */
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

      /* ② 清空选择（必须排在「③ 展示线稿图」之前，否则界面会出现 1/3/2 的错序） */
      const btnClear = node.addWidget("button", t("btnClear"), null, () => {
        const w = ensureHiddenWidget(node);
        w.value = "";
        paintSelection(node);
        node.setDirtyCanvas(true, true);
      });

      /* ③ 展示线稿图 */
      const btnShow = node.addWidget("button", t("btnShowSketch"), null, () => {
        refreshPreviewData(node);
      });

      /* 线稿预览占位槽：插在 ③ 之下、下载按钮之前 */
      ensurePreviewSpacer(node);
      /* ① 上方留白 15px，把按钮组与参数区拉开 */
      ensureTopGap(node);
      /* 底部状态行占位槽（画绿色「素材已下载 · N 个姿态 / M 张图」） */
      ensureStatusSpacer(node);
      /* 供下载器在状态文字变化后刷新高度 */
      node._pgDlStatusSync = () => {
        pinStatusSpacerLast(node);
        relayoutNode(node);
      };

      node._pgRelabel = () => {
        if (btnOpen) btnOpen.name = t("btnOpenPicker");
        if (btnShow) btnShow.name = t("btnShowSketch");
        if (btnClear) btnClear.name = t("btnClear");
        pinTopGapBeforePicker(node);
        pinSpacerAfterShow(node);
        pinStatusSpacerLast(node);
        pinDownloadButtonLast(node);
        paintSelection(node);
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

      /* 首帧后重排一次，让占位槽高度生效，并把下载按钮归位到最后 */
      requestAnimationFrame(() => {
        shrinkMultilineWidgets(node);
        pinTopGapBeforePicker(node);
        pinSpacerAfterShow(node);
        pinStatusSpacerLast(node);
        pinDownloadButtonLast(node);
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

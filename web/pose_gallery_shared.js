/* Pose Gallery —— 共享常量与工具

 * 被 panel / node / downloader 三个模块引用。
 */

const NODE_NAMES = ["PoseGalleryLoader", "PoseGalleryAngleSet", "PoseGalleryBatchLoader"];

/* 缩略图宽度三档（像素）。姿态图原始比例 3:4，图片框严格按 3:4 渲染。 */
const THUMB_WIDTHS = [90, 120, 150];
const THUMB_WIDTH_KEY = "pose-gallery-thumb-width";
const THUMB_ASPECT = "3 / 4";

/* 面板尺寸（可自由拉宽拉高），记住用户上次设置 */
const PANEL_SIZE_KEY = "pose-gallery-panel-size";
const PANEL_DEFAULT = { w: 1180, h: 860 };
const PANEL_MIN = { w: 520, h: 320 };

function readPanelSize() {
  try {
    const raw = JSON.parse(localStorage.getItem(PANEL_SIZE_KEY) || "null");
    if (raw && raw.w >= PANEL_MIN.w && raw.h >= PANEL_MIN.h) {
      return { w: Math.round(raw.w), h: Math.round(raw.h) };
    }
  } catch (e) { /* ignore */ }
  return { ...PANEL_DEFAULT };
}

function writePanelSize(w, h) {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify({ w: Math.round(w), h: Math.round(h) }));
  } catch (e) { /* ignore */ }
}

function readThumbWidth() {
  try {
    const v = parseInt(localStorage.getItem(THUMB_WIDTH_KEY) || "", 10);
    return THUMB_WIDTHS.includes(v) ? v : 120;
  } catch (e) {
    return 120;
  }
}

function writeThumbWidth(px) {
  try { localStorage.setItem(THUMB_WIDTH_KEY, String(px)); } catch (e) { /* ignore */ }
}

/* 不同节点允许多选吗？ */
function allowMulti(nodeType) {
  return nodeType === "PoseGalleryBatchLoader";
}

export {
  NODE_NAMES, THUMB_WIDTHS, THUMB_ASPECT, PANEL_MIN, PANEL_DEFAULT,
  readPanelSize, writePanelSize, readThumbWidth, writeThumbWidth, allowMulti,
};

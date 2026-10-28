import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { t, getLang, onLangChange, makeLangSwitcher } from "./pose_gallery_i18n.js";

/*
 * Pose Gallery —— 节点内图库选择面板
 *
 * 参考了三类成熟做法：
 *   · netaart/comfyui-browser：后端路由 + 前端面板，不把海量条目塞进下拉框
 *   · BigStationW/ComfyUi-ImageGalleryLoader：选择结果写回 hidden widget
 *   · ZHO-ZHO-ZHO/ComfyUI-ArtGallery：按钮式预览，点图即选
 *
 * 交互：
 *   - 节点上出现「打开图库」按钮 → 弹出覆盖层面板
 *   - 面板：系统 / 分类 / 角度筛选 + 关键词搜索 + 姿态网格
 *   - 点姿态卡片选中；多选模式下可勾多个（批量节点）
 *   - 确认后把选中结果写入节点隐藏 widget（selected_id），前端显示选中缩略图
 *
 * 多语言：界面文案走 pose_gallery_i18n.js（中文 / 日本語 / English），默认中文。
 * 语言切换后重建面板 UI（数据保留，不重新请求）。
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
/* 面板                                                               */
/* ------------------------------------------------------------------ */

class PickerPanel {
  constructor(node, onPick) {
    this.node = node;
    this.onPick = onPick;
    this.multi = allowMulti(node.comfyClass);
    this.selected = new Set();
    this.cfg = null;
    this.poses = [];
    this.total = 0;
    this.offset = 0;
    this.limit = 60;
    this._build();
  }

  _el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  _build() {
    const wrap = this._el("div", "pg-mask");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:rgba(6,8,11,.82);" +
      "backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px";

    const box = this._el("div", "pg-box");
    const boxSize = readPanelSize();
    box.style.cssText =
      "width:" + boxSize.w + "px;height:" + boxSize.h + "px;" +
      "max-width:98vw;max-height:96vh;min-width:520px;min-height:320px;" +
      "display:flex;flex-direction:column;position:relative;" +
      "background:#15181e;border:1px solid #2c323c;border-radius:14px;overflow:hidden;" +
      "box-shadow:0 24px 64px rgba(0,0,0,.6);color:#e6e9ee;" +
      "resize:none;" +   /* 用自定义手柄，原生 resize 会抢走右下角并绕过尺寸记忆 */
      "font:13px/1.5 system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif";
    this.box = box;

    /* 顶栏 */
    const head = this._el("div");
    head.style.cssText =
      "display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #2c323c;" +
      "background:#11141a;flex:0 0 auto";
    const title = this._el("div", null, t("appTitle"));
    title.style.cssText = "font-size:15px;font-weight:700;letter-spacing:.02em";
    const sub = this._el("div", null, "");
    sub.style.cssText = "color:#8b93a1;font-size:12px";
    this.subEl = sub;
    this.titleEl = title;
    head.append(title, sub);

    const spacer = this._el("div");
    spacer.style.cssText = "flex:1";

    /* 语言切换（中文 / 日本語 / English） */
    this.langSwitcher = makeLangSwitcher(() => this._relabel());
    head.append(this.langSwitcher);

    const closeBtn = this._el("button", null, "✕");
    closeBtn.title = t("close");
    closeBtn.style.cssText =
      "width:34px;height:34px;border-radius:8px;border:1px solid #39404b;background:#1b1f27;" +
      "color:#cfd5de;cursor:pointer;font-size:15px";
    closeBtn.onclick = () => this.close();
    head.append(closeBtn);

    /* 筛选栏 */
    const bar = this._el("div");
    bar.style.cssText =
      "display:flex;flex-wrap:wrap;gap:10px;padding:12px 18px;border-bottom:1px solid #23282f;" +
      "background:#13161c;flex:0 0 auto;align-items:center";

    this.selSystem = this._select(bar, "filterSystem", "allSystem");
    this.selCategory = this._select(bar, "filterCategory", "allCategory");
    this.selAngle = this._select(bar, "filterAngle", "allAngle");

    const q = document.createElement("input");
    q.type = "search";
    q.placeholder = t("searchPlaceholder");
    q.style.cssText =
      "flex:1;min-width:180px;height:32px;padding:0 12px;border-radius:8px;" +
      "border:1px solid #39404b;background:#0f1217;color:#e6e9ee;outline:none";
    this.qEl = q;
    bar.append(q);

    /* 缩略图宽度（90 / 120 / 150 三档） */
    this.thumbWidth = readThumbWidth();
    const sizeBox = this._el("div");
    sizeBox.style.cssText =
      "display:inline-flex;gap:2px;padding:2px;border:1px solid #39404b;border-radius:7px;background:#0f1217";
    this.sizeBtns = {};
    for (const px of THUMB_WIDTHS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = String(px);
      b.title = t("thumbWidthTip", { px });
      b.style.cssText =
        "height:24px;padding:0 8px;border:0;border-radius:5px;cursor:pointer;" +
        "font-size:11.5px;background:transparent;color:#9aa3b1;transition:background .12s,color .12s";
      b.onclick = () => {
        this.thumbWidth = px;
        writeThumbWidth(px);
        this._paintSizeButtons();
        this._applyGridWidth();
        this._render();          // 卡片宽度是内联样式，必须重绘才会生效
      };
      this.sizeBtns[px] = b;
      sizeBox.append(b);
    }
    bar.append(sizeBox);
    this.sizeBox = sizeBox;

    /* 选中提示 */
    const selInfo = this._el("div", null, "");
    selInfo.style.cssText = "color:#8fb4ff;font-size:12px;white-space:nowrap";
    this.selInfoEl = selInfo;
    bar.append(selInfo);

    /* 网格：列宽跟随所选缩略图宽度，图片固定 3:4；四周间距统一 4px */
    const grid = this._el("div");
    grid.style.cssText =
      "flex:1;overflow:auto;padding:4px;display:grid;gap:4px;" +
      "align-content:start;background:#0f1217";
    this.gridEl = grid;
    this._applyGridWidth();
    this._paintSizeButtons();

    /* 底栏 */
    const foot = this._el("div");
    foot.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #2c323c;" +
      "background:#11141a;flex:0 0 auto";
    this.countEl = this._el("div", null, "");
    this.countEl.style.cssText = "color:#8b93a1;font-size:12px;flex:1";

    this.btnMore = this._btn(t("loadMore"));
    this.btnMore.onclick = () => this.load(this.offset + this.limit, true);

    this.btnClearSel = this._btn(t("clearSelection"));
    this.btnClearSel.onclick = () => { this.selected.clear(); this._sync(); this._render(); };

    this.btnOk = this._btn(t("btnOk"), true);
    this.btnOk.onclick = () => {
      this.onPick([...this.selected]);
      this.close();
    };

    foot.append(this.countEl, this.btnMore, this.btnClearSel, this.btnOk);

    box.append(head, bar, grid, foot);
    wrap.append(box);
    this.wrap = wrap;
    document.body.appendChild(wrap);

    /* 右下角拖拽手柄：可自由拉宽 / 拉高，尺寸记住 */
    this._addResizeHandle(wrap, box);

    /* 事件 */
    q.addEventListener("input", () => {
      clearTimeout(this._qt);
      this._qt = setTimeout(() => this.load(0, false), 200);
    });
    this.selSystem.addEventListener("change", () => this.load(0, false));
    this.selCategory.addEventListener("change", () => this.load(0, false));
    this.selAngle.addEventListener("change", () => this.load(0, false));

    const esc = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); this.close(); } };
    this._escHandler = esc;
    document.addEventListener("keydown", esc, true);
  }

  /**
   * 面板右下角拖拽手柄。
   * 拖拽时实时改 box 宽高，松手写入 localStorage，下次打开沿用。
   */
  _addResizeHandle(wrap, box) {
    const grip = this._el("div", "pg-resize");
    grip.title = t("panelResizeTip");
    grip.style.cssText =
      "position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;" +
      "display:flex;align-items:flex-end;justify-content:flex-end;z-index:3;" +
      "background:transparent";
    /* 三条斜线，做成常见 resize 视觉 */
    const marks = this._el("div");
    marks.style.cssText =
      "width:10px;height:10px;margin:0 3px 3px 0;" +
      "background:" +
      "linear-gradient(135deg,transparent 0 45%,#6b7482 45% 55%,transparent 55% 100%)," +
      "linear-gradient(135deg,transparent 0 25%,#6b7482 25% 35%,transparent 35% 100%)," +
      "linear-gradient(135deg,transparent 0 65%,#6b7482 65% 75%,transparent 75% 100%)";
    grip.append(marks);
    box.append(grip);

    let dragging = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;

    const onMove = (ev) => {
      if (!dragging) return;
      const maxW = window.innerWidth * 0.98;
      const maxH = window.innerHeight * 0.96;
      const w = Math.min(maxW, Math.max(PANEL_MIN.w, startW + (ev.clientX - startX)));
      const h = Math.min(maxH, Math.max(PANEL_MIN.h, startH + (ev.clientY - startY)));
      box.style.width = w + "px";
      box.style.height = h + "px";
      /* 拖拽过程中就写入，避免鼠标移出窗口时 mouseup 丢失 */
      writePanelSize(w, h);
      ev.preventDefault();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      const w = parseFloat(box.style.width) || box.getBoundingClientRect().width;
      const h = parseFloat(box.style.height) || box.getBoundingClientRect().height;
      writePanelSize(w, h);
    };

    grip.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      dragging = true;
      const r = box.getBoundingClientRect();
      startW = r.width; startH = r.height;
      startX = ev.clientX; startY = ev.clientY;
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    });
  }

  _select(parent, labelKey, allKey) {
    const sel = document.createElement("select");
    sel.style.cssText =
      "height:32px;padding:0 10px;border-radius:8px;border:1px solid #39404b;" +
      "background:#0f1217;color:#e6e9ee;outline:none;cursor:pointer";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = t(allKey);
    opt.dataset.i18nKey = allKey;
    sel.append(opt);
    /* 记住 key，切换语言时可重建 */
    sel.dataset.labelKey = labelKey;
    sel.dataset.allKey = allKey;
    parent.append(sel);
    return sel;
  }

  _btn(text, primary) {
    const b = this._el("button", null, text);
    b.style.cssText =
      "height:32px;padding:0 14px;border-radius:8px;cursor:pointer;font-size:13px;" +
      (primary
        ? "border:1px solid #4a7cf0;background:#3b6fe0;color:#fff;font-weight:600"
        : "border:1px solid #39404b;background:#1b1f27;color:#cfd5de");
    return b;
  }

  /** 语言切换后刷新静态文案（保留已加载数据与选中状态） */
  _relabel() {
    if (this.titleEl) this.titleEl.textContent = t("appTitle");
    if (this.qEl) this.qEl.placeholder = t("searchPlaceholder");
    this._relabelAllOption(this.selSystem);
    this._relabelAllOption(this.selCategory);
    this._relabelAllOption(this.selAngle);
    if (this.btnMore) this.btnMore.textContent = t("loadMore");
    if (this.btnClearSel) this.btnClearSel.textContent = t("clearSelection");
    if (this.btnOk) this.btnOk.textContent = t("btnOk");
    this._paintSub();
    this._render();          // 重绘网格以更新计数文案等
  }

  _relabelAllOption(sel) {
    if (!sel) return;
    const first = sel.querySelector("option");
    if (first && first.dataset.i18nKey) {
      first.textContent = t(first.dataset.i18nKey);
    }
  }

  _paintSizeButtons() {
    for (const px of THUMB_WIDTHS) {
      const b = this.sizeBtns && this.sizeBtns[px];
      if (!b) continue;
      const on = px === this.thumbWidth;
      b.style.background = on ? "#2f6fed" : "transparent";
      b.style.color = on ? "#fff" : "#9aa3b1";
      b.style.fontWeight = on ? "600" : "400";
    }
  }

  /** 网格列宽跟随缩略图宽度（固定像素列，保证 3:4 不被拉伸） */
  _applyGridWidth() {
    if (!this.gridEl) return;
    const w = this.thumbWidth || 120;
    this.gridEl.style.gridTemplateColumns = `repeat(auto-fill, minmax(${w}px, ${w}px))`;
    this.gridEl.style.justifyContent = "start";
    /* 行高与卡片高度保持一致，避免网格把卡片压扁 */
    const imgH = Math.round((w * 4) / 3);
    const nameFs = w <= 90 ? 10.5 : 12;
    const idFs = w <= 90 ? 9.5 : 10.5;
    const nameH = Math.round(nameFs * 1.35) * 2;
    const idH = Math.round(idFs * 1.4) + 2;
    const capH = 4 + nameH + idH + 5;
    this.gridEl.style.gridAutoRows = (imgH + capH + 2) + "px";
  }

  _paintSub() {
    if (!this.subEl) return;
    if (this.cfg && this.cfg.ready !== false) {
      const poses = this.cfg.total_poses;
      const images = this.cfg.total_images;
      this.subEl.textContent =
        `${this.cfg.title || t("appTitle")} · ${poses != null ? poses : 0} ${t("posesUnit")} / ` +
        `${images != null ? images : 0} ${t("imagesUnit")}`;
    } else if (this.cfg) {
      /* 素材还没下载：不要显示 undefined，直接说明状态 */
      this.subEl.textContent = t("libNotReadyShort");
    }
  }

  async init() {
    try {
      this.cfg = await apiJson("/pose_gallery/config");
    } catch (e) {
      this._error(t("configFail", { msg: e.message }));
      return;
    }
    this._paintSub();
    this._fill(this.selSystem, this.cfg.systems);
    this._fill(this.selCategory, this.cfg.categories);
    this._fill(this.selAngle, this.cfg.angles);
    /* 素材库还没准备好时，给出明确指引而不是一句「没有符合条件的姿态」 */
    if (this.cfg.ready === false) {
      this._needLibrary(this.cfg.error || "");
      return;
    }
    await this.load(0, false);
  }

  _needLibrary(detail) {
    this.gridEl.innerHTML = "";
    const box = this._el("div");
    box.style.cssText =
      "grid-column:1/-1;padding:36px 24px;text-align:center;color:#a9b2c0;line-height:1.8";
    const h = this._el("div", null, t("libNotReadyTitle"));
    h.style.cssText = "font-size:14px;font-weight:700;color:#e6e9ee;margin-bottom:8px";
    const p1 = this._el("div", null, t("libNotReadyHint"));
    const p2 = this._el("div", null, t("libNotReadyPath", { path: this.cfg.library_dir || "" }));
    p2.style.cssText = "font-size:12px;color:#7d8592;margin-top:6px;word-break:break-all";
    box.append(h, p1, p2);
    if (detail) {
      const d = this._el("div", null, detail.split("\n")[0]);
      d.style.cssText = "font-size:11.5px;color:#66707e;margin-top:10px";
      box.append(d);
    }
    this.gridEl.append(box);
    if (this.countEl) this.countEl.textContent = t("libNotReadyShort");
  }

  _fill(sel, values) {
    for (const v of values || []) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.append(o);
    }
  }

  _error(msg) {
    this.gridEl.innerHTML = "";
    const d = this._el("div", null, msg);
    d.style.cssText = "grid-column:1/-1;padding:40px;text-align:center;color:#ff8f8f";
    this.gridEl.append(d);
  }

  async load(offset, append) {
    const p = new URLSearchParams();
    if (this.selSystem.value) p.set("system", this.selSystem.value);
    if (this.selCategory.value) p.set("category", this.selCategory.value);
    if (this.selAngle.value) p.set("angle", this.selAngle.value);
    if (this.qEl.value.trim()) p.set("q", this.qEl.value.trim());
    p.set("limit", String(this.limit));
    p.set("offset", String(offset));

    let data;
    try {
      data = await apiJson("/pose_gallery/poses?" + p.toString());
    } catch (e) {
      this._error(t("listFail", { msg: e.message }));
      return;
    }
    this.offset = offset;
    this.total = data.total;
    this.poses = append ? this.poses.concat(data.items) : data.items;
    this._render();
  }

  _render() {
    /* 素材库未就绪时，任何一次重绘都要保持「未就绪」提示，不能被清成空白 */
    if (this.cfg && this.cfg.ready === false) {
      this._needLibrary(this.cfg.error || "");
      return;
    }
    this.gridEl.innerHTML = "";
    const W = this.thumbWidth || 120;
    /* 图片区严格 3:4；卡片宽度 = 缩略图宽度，高度 = 图高 + 文字区，显式写死避免被网格行压扁 */
    const IMG_H = Math.round((W * 4) / 3);
    const NAME_FS = W <= 90 ? 10.5 : 12;
    const ID_FS = W <= 90 ? 9.5 : 10.5;
    const CAP_PAD_T = 4, CAP_PAD_B = 5;
    const NAME_LH = Math.round(NAME_FS * 1.35);
    const NAME_H = NAME_LH * 2;            /* 最多两行 */
    const ID_H = Math.round(ID_FS * 1.4) + 2;  /* 一行 + margin */
    const CAP_H = CAP_PAD_T + NAME_H + ID_H + CAP_PAD_B;
    const CARD_H = IMG_H + CAP_H + 2;      /* +2 上下边框 */
    this.gridEl.style.gridAutoRows = CARD_H + "px";
    this.gridEl.style.gridAutoFlow = "row";

    for (const p of this.poses) {
      const card = this._el("div", "pg-card");
      const on = this.selected.has(p.pose_id);
      /* 边框用 inset 阴影实现，不占盒模型宽度，保证图片精确 3:4 */
      card.style.cssText =
        "position:relative;box-sizing:border-box;border-radius:10px;overflow:hidden;cursor:pointer;" +
        "width:" + W + "px;height:" + CARD_H + "px;flex:0 0 auto;" +
        "display:flex;flex-direction:column;" +
        "background:#1a1e25;border:0;" +
        "box-shadow:inset 0 0 0 1px " + (on ? "#4a7cf0" : "#2a303a") +
        ";transition:transform .12s,box-shadow .12s";

      /* 图片容器固定 3:4，不允许被压缩 */
      const imgBox = this._el("div");
      imgBox.style.cssText =
        "position:relative;flex:0 0 auto;width:100%;height:" + IMG_H + "px;" +
        "aspect-ratio:" + THUMB_ASPECT + ";overflow:hidden;background:#f2f2f0";
      const im = document.createElement("img");
      im.loading = "lazy";
      im.src = p.cover_url || "";
      im.alt = p.name;
      im.style.cssText =
        "width:100%;height:100%;aspect-ratio:" + THUMB_ASPECT +
        ";object-fit:cover;object-position:center top;display:block";
      imgBox.append(im);
      card.append(imgBox);

      const cap = this._el("div");
      cap.style.cssText =
        "flex:0 0 auto;height:" + CAP_H + "px;box-sizing:border-box;overflow:hidden;" +
        "padding:" + CAP_PAD_T + "px 6px " + CAP_PAD_B + "px";
      const h = this._el("div", null, p.name);
      h.style.cssText = "font-size:" + NAME_FS + "px;font-weight:600;line-height:" + NAME_LH + "px;" +
        "height:" + NAME_H + "px;display:-webkit-box;-webkit-line-clamp:2;" +
        "-webkit-box-orient:vertical;overflow:hidden";
      const idl = this._el("div", null, `${p.number} · ${p.category}`);
      idl.style.cssText = "font-size:" + ID_FS + "px;color:#7d8592;margin-top:2px;height:" + Math.round(ID_FS * 1.4) + "px;" +
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      cap.append(h, idl);
      card.append(cap);

      /* 选中角标 */
      const tick = this._el("div", null, "✓");
      const ts = W <= 90 ? 18 : 22;
      tick.style.cssText =
        "position:absolute;top:4px;right:4px;width:" + ts + "px;height:" + ts + "px;border-radius:50%;" +
        "display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;" +
        (on ? "background:#3b6fe0;color:#fff" : "background:rgba(10,12,16,.6);color:transparent");
      card.append(tick);

      card.onclick = () => {
        if (!this.multi) this.selected.clear();
        if (this.selected.has(p.pose_id)) this.selected.delete(p.pose_id);
        else this.selected.add(p.pose_id);
        this._render();
      };
      card.onmouseenter = () => { card.style.transform = "translateY(-2px)"; };
      card.onmouseleave = () => { card.style.transform = ""; };

      this.gridEl.append(card);
    }

    if (!this.poses.length) {
      const d = this._el("div", null, t("emptyResult"));
      d.style.cssText = "grid-column:1/-1;padding:40px;text-align:center;color:#7d8592";
      this.gridEl.append(d);
    }

    this.countEl.textContent =
      t("poseTotal", { total: this.total, shown: this.poses.length }) +
      (this.multi ? t("multiHint") : t("singleHint"));
    this._sync();
  }

  _sync() {
    const n = this.selected.size;
    this.selInfoEl.textContent = n ? t("selectedN", { n }) : "";
  }

  close() {
    document.removeEventListener("keydown", this._escHandler, true);
    this.wrap.remove();
  }
}

/* ------------------------------------------------------------------ */
/* 节点挂载                                                           */
/* ------------------------------------------------------------------ */

const HIDDEN_NAME = "selected_id";

function ensureHiddenWidget(node) {
  let w = node.widgets && node.widgets.find((x) => x.name === HIDDEN_NAME);
  if (w) return w;
  w = node.addWidget("text", HIDDEN_NAME, "", () => {}, { serialize: true });
  w.computeSize = () => [0, -4];        // 不在 UI 上占高度
  w.type = "hidden";
  if (w.element) w.element.style.display = "none";
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
  node._pgBadge.textContent = ids.length
    ? (ids.length === 1 ? t("selectedOne", { id: ids[0] }) : t("selectedMany", { n: ids.length }))
    : t("notSelected");
  node._pgBadge.style.color = ids.length ? "#8fb4ff" : "#7d8592";
  renderNodePreview(node);
}

/* ------------------------------------------------------------------ */
/* 节点内联线稿预览                                                    */
/* ------------------------------------------------------------------ */

/* 每个 image_id 对应的缩略图 URL；封面即「正面」角度 */
function thumbUrlOf(imageId) {
  return "/pose_gallery/thumb?image_id=" + encodeURIComponent(imageId || "");
}

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

  /* 预览宽度跟随节点实际可用宽度，保持 3:4；4 张时自动排成两行 */
  const availW = Math.max(80, Math.min(150, (node.size ? node.size[0] : 270) - 40));
  const cols = items.length > 1 ? 2 : 1;
  const W = Math.max(60, Math.floor((availW - (cols - 1) * 8) / cols));
  const H = Math.round((W * 4) / 3);   /* 严格 3:4 */
  host.style.gap = "8px";
  host.style.flexWrap = "wrap";

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

  fitNodePreview(node, H);
}

/** 让节点高度包住预览区，避免图被裁掉 */
function fitNodePreview(node, previewH) {
  if (!node || !node.size) return;
  const extra = previewH ? previewH + 26 : 0;
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

      ensureHiddenWidget(node);

      /* 选中状态标签 */
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
        wrap.style.cssText = "display:flex;flex-direction:column;gap:2px";
        wrap.append(badge, preview);
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

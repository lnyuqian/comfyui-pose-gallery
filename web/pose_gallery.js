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
    box.style.cssText =
      "width:min(1180px,96vw);height:min(86vh,900px);display:flex;flex-direction:column;" +
      "background:#15181e;border:1px solid #2c323c;border-radius:14px;overflow:hidden;" +
      "box-shadow:0 24px 64px rgba(0,0,0,.6);color:#e6e9ee;" +
      "font:13px/1.5 system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif";

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

    /* 选中提示 */
    const selInfo = this._el("div", null, "");
    selInfo.style.cssText = "color:#8fb4ff;font-size:12px;white-space:nowrap";
    this.selInfoEl = selInfo;
    bar.append(selInfo);

    /* 网格 */
    const grid = this._el("div");
    grid.style.cssText =
      "flex:1;overflow:auto;padding:14px 18px;display:grid;gap:12px;" +
      "grid-template-columns:repeat(auto-fill,minmax(140px,1fr));align-content:start;" +
      "background:#0f1217";
    this.gridEl = grid;

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

  _paintSub() {
    if (!this.subEl) return;
    if (this.cfg) {
      this.subEl.textContent =
        `${this.cfg.title || t("appTitle")} · ${this.cfg.total_poses} ${t("posesUnit")} / ` +
        `${this.cfg.total_images} ${t("imagesUnit")}`;
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
    await this.load(0, false);
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
    this.gridEl.innerHTML = "";
    for (const p of this.poses) {
      const card = this._el("div", "pg-card");
      const on = this.selected.has(p.pose_id);
      card.style.cssText =
        "position:relative;border-radius:10px;overflow:hidden;cursor:pointer;" +
        "background:#1a1e25;border:1px solid " + (on ? "#4a7cf0" : "#2a303a") +
        ";transition:transform .12s,border-color .12s";

      const im = document.createElement("img");
      im.loading = "lazy";
      im.src = p.cover_url || "";
      im.alt = p.name;
      im.style.cssText = "width:100%;aspect-ratio:3/4;object-fit:contain;background:#f2f2f0;display:block";
      card.append(im);

      const cap = this._el("div");
      cap.style.cssText = "padding:7px 9px 9px";
      const h = this._el("div", null, p.name);
      h.style.cssText = "font-size:12px;font-weight:600;line-height:1.4;" +
        "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden";
      const idl = this._el("div", null, `${p.number} · ${p.category}`);
      idl.style.cssText = "font-size:10.5px;color:#7d8592;margin-top:3px";
      cap.append(h, idl);
      card.append(cap);

      /* 选中角标 */
      const tick = this._el("div", null, "✓");
      tick.style.cssText =
        "position:absolute;top:7px;right:7px;width:22px;height:22px;border-radius:50%;" +
        "display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;" +
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

      /* ComfyUI 新版用 addDOMWidget 承载自定义 DOM */
      if (node.addDOMWidget) {
        const dom = node.addDOMWidget("pg_picker", "pg_picker", badge, {
          getValue: () => selectedOf(node).join(","),
          setValue: () => {},
          hideOnZoom: false,
        });
        if (dom) dom.serialize = false;
      }

      /* 打开图库按钮 */
      const btnOpen = node.addWidget("button", t("btnOpenPicker"), null, () => {
        const panel = new PickerPanel(node, (ids) => {
          const w = ensureHiddenWidget(node);
          w.value = JSON.stringify(ids);
          paintSelection(node);
          node.setDirtyCanvas(true, true);
        });
        panel.init().then(() => {
          /* 回填已选项 */
          for (const id of selectedOf(node)) panel.selected.add(id);
          panel._render();
        });
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

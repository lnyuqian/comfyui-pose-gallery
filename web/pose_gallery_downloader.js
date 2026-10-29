/* Pose Gallery —— 素材一键下载面板
 *
 * 定位：
 *   本插件（仓库里）**不分发任何图片**。这个面板做的事是：
 *   把素材从原作者站点下载到「用户自己这台机器」的目录里 ——
 *   即「用户个人获取」，不是「插件代用户再分发」。
 *
 * 原作者条款：允许作品制作中的商用/编辑/参考，禁止再分发/转载/转售图像本身。
 *
 * 多语言：文案走 pose_gallery_i18n.js（中文 / 日本語 / English），默认中文。
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { t, onLangChange, makeLangSwitcher } from "./pose_gallery_i18n.js";

const apiJson = async (path, opts) => {
  const res = await api.fetchApi(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `HTTP ${res.status}`);
  }
  return data;
};

const el = (tag, css, text) => {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
};

/* 轻提示 */
function toast(msg) {
  const box = el("div",
    "position:fixed;left:50%;bottom:34px;transform:translateX(-50%);" +
    "background:rgba(20,24,30,.97);color:#e9ecf1;border:1px solid #39404b;" +
    "padding:10px 18px;border-radius:10px;font-size:13px;z-index:20001;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:min(88vw,520px);text-align:center;" +
    "line-height:1.5;transition:opacity .2s", msg);
  document.body.appendChild(box);
  setTimeout(() => {
    box.style.opacity = "0";
    setTimeout(() => box.remove(), 250);
  }, 3200);
}

const COL = {
  head: "#11141a",
  panel: "#15181e",
  line: "#2c323c",
  field: "#0f1217",
  tx: "#e6e9ee",
  tx2: "#9aa3b1",
  blue: "#8fb4ff",
  green: "#49c47c",
  amber: "#e0a03c",
  red: "#ff8f8f",
};

/* ---------------------------------------------------------------- */

export class DownloadPanel {
  constructor(onDone) {
    this.onDone = onDone;
    this.timer = null;
    this.lib = null;
    this.cfg = null;
    this._build();
    /* 语言切换时局部刷新文案，不重建 DOM（避免丢进度） */
    this._offLang = onLangChange(() => this._relabel());
  }

  _build() {
    const mask = el("div",
      "position:fixed;inset:0;z-index:20000;background:rgba(6,8,11,.84);" +
      "backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px");
    const box = el("div",
      "width:min(620px,94vw);background:" + COL.panel + ";border:1px solid " + COL.line +
      ";border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.6);color:" + COL.tx +
      ";overflow:hidden;font:13px/1.6 system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif");

    /* 头 */
    const head = el("div",
      "display:flex;align-items:center;gap:10px;padding:14px 18px;" +
      "border-bottom:1px solid " + COL.line + ";background:" + COL.head);
    this.titleEl = el("div", "font-size:15px;font-weight:700", t("dlTitle"));
    head.append(this.titleEl);
    head.append(el("div", "flex:1"));
    this.langSwitcher = makeLangSwitcher();   // 语言切换
    head.append(this.langSwitcher);
    const close = el("button",
      "width:32px;height:32px;border-radius:8px;border:1px solid #39404b;background:#1b1f27;" +
      "color:#cfd5de;cursor:pointer", "✕");
    close.title = t("close");
    close.onclick = () => this.close();
    head.append(close);

    /* 正文 */
    const body = el("div", "padding:16px 18px;display:flex;flex-direction:column;gap:14px");
    this.introEl = el("div", "color:#a9b2c0;font-size:12.5px;line-height:1.7", t("dlIntro"));
    body.append(this.introEl);

    this.infoEl = el("div",
      "background:" + COL.field + ";border:1px solid #262c35;border-radius:10px;" +
      "padding:12px 14px;font-size:12.5px;color:" + COL.tx2 + ";line-height:1.8");
    body.append(this.infoEl);

    /* 选项 */
    const opts = el("div", "display:flex;flex-direction:column;gap:10px");
    const mk = (labelKey, hintKey, checked) => {
      const row = el("label", "display:flex;align-items:flex-start;gap:9px;cursor:pointer");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = checked;
      cb.style.cssText = "margin-top:3px;width:15px;height:15px;cursor:pointer";
      const txt = el("div");
      const l1 = el("div", "color:#dfe4ec", t(labelKey));
      const l2 = el("div", "font-size:11.5px;color:#7d8592", t(hintKey));
      txt.append(l1, l2);
      row.append(cb, txt);
      opts.append(row);
      return { cb, l1, l2, labelKey, hintKey };
    };
    this.oThumb = mk("dlOptThumbs", "dlOptThumbsHint", true);
    this.oFull = mk("dlOptFulls", "dlOptFullsHint", true);
    this.oSmall = mk("dlOptSmall", "dlOptSmallHint", false);
    body.append(opts);

    /* 进度 */
    this.progressWrap = el("div", "display:none;flex-direction:column;gap:6px");
    const barBg = el("div", "height:8px;background:#22272f;border-radius:99px;overflow:hidden");
    this.barFg = el("div", "height:100%;width:0%;background:linear-gradient(90deg,#3b6fe0,#5b8ef7);transition:width .3s");
    barBg.append(this.barFg);
    this.progTxt = el("div", "font-size:12px;color:" + COL.tx2);
    this.progressWrap.append(barBg, this.progTxt);
    body.append(this.progressWrap);

    /* 底部 */
    const foot = el("div",
      "display:flex;gap:10px;justify-content:flex-end;padding:14px 18px;" +
      "border-top:1px solid " + COL.line + ";background:" + COL.head);
    this.btnLater = el("button",
      "height:34px;padding:0 16px;border-radius:8px;border:1px solid #39404b;background:#1b1f27;" +
      "color:#cfd5de;cursor:pointer", t("dlLater"));
    this.btnLater.onclick = () => this.close();
    this.btnStart = el("button",
      "height:34px;padding:0 18px;border-radius:8px;border:1px solid #4a7cf0;" +
      "background:#3b6fe0;color:#fff;font-weight:600;cursor:pointer", t("dlStart"));
    this.btnStart.onclick = () => this.start();
    foot.append(this.btnLater, this.btnStart);

    box.append(head, body, foot);
    mask.append(box);
    this.mask = mask;
    document.body.appendChild(mask);

    this._esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); this.close(); } };
    document.addEventListener("keydown", this._esc, true);

    this._paintInfo();
    this._paintButtons();
  }

  /* ---------- 文案绘制 ---------- */

  /** 渲染信息区。数据来自 this.cfg / this.lib，缺少时显示占位。 */
  _paintInfo() {
    const lib = this.lib || {};
    const rows = [];
    const b = (s) => `<b style='color:${COL.tx}'>${s}</b>`;

    if (this.cfg && this.cfg.ready !== false) {
      const tp = this.cfg.total_poses != null ? this.cfg.total_poses : 0;
      const ti = this.cfg.total_images != null ? this.cfg.total_images : 0;
      rows.push(`<div>${t("dlTotal")}：${b(`${tp} ${t("posesUnit")} / ${ti} ${t("imagesUnit")}`)}</div>`);
    }
    rows.push(`<div>${t("dlEstSize")}：${b("~610 MB")}</div>`);
    if (lib.path) {
      rows.push(`<div>${t("dlSaveTo")}：<span style='color:${COL.blue};word-break:break-all'>${lib.path}</span></div>`);
    }
    if (lib.ready) {
      rows.push(`<div>${t("dlStatus")}：<b style='color:${COL.green}'>${t("dlReady")}</b>（${t("dlReadyDetail", { imgs: lib.images, thumbs: lib.thumbs })}）</div>`);
    } else if (lib.path) {
      rows.push(`<div>${t("dlStatus")}：<b style='color:${COL.amber}'>${t("dlNotReady")}</b></div>`);
    }
    this.infoEl.innerHTML = rows.join("");
  }

  _paintButtons() {
    const downloading = this._downloading === true;
    this.btnLater.textContent = t("dlLater");
    if (downloading) {
      this.btnStart.textContent = t("dlDownloading");
      this.btnStart.disabled = true;
      this.btnStart.style.opacity = ".55";
    } else {
      this.btnStart.textContent = this.lib && this.lib.ready ? t("dlRecheck") : t("dlStart");
      this.btnStart.disabled = false;
      this.btnStart.style.opacity = "1";
    }
  }

  _relabel() {
    this.titleEl.textContent = t("dlTitle");
    this.introEl.textContent = t("dlIntro");
    for (const o of [this.oThumb, this.oFull, this.oSmall]) {
      o.l1.textContent = t(o.labelKey);
      o.l2.textContent = t(o.hintKey);
    }
    this._paintInfo();
    this._paintButtons();
  }

  /* ---------- 初始化 ---------- */

  async init() {
    try {
      const cfg = await apiJson("/pose_gallery/config");
      this.cfg = cfg;
      this.lib = cfg.library || {};
      this._paintInfo();
      this._paintButtons();
    } catch (e) {
      this.infoEl.innerHTML =
        `<span style='color:${COL.red}'>${t("dlStateFail", { msg: String(e.message || e) })}</span>`;
    }

    // 已有下载在跑 → 接管进度
    try {
      const st = await apiJson("/pose_gallery/download/status");
      if (st.progress && st.progress.running) {
        this.progressWrap.style.display = "flex";
        this._downloading = true;
        this._paintButtons();
        this._poll();
      }
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 动作 ---------- */

  async start() {
    const body = {
      thumbs: this.oThumb.cb.checked,
      fulls: this.oFull.cb.checked,
      workers: 10,
    };
    if (!body.thumbs && !body.fulls) {
      toast(t("dlNeedOne"));
      return;
    }
    if (this.oSmall.cb.checked) body.limit_poses = 20;

    this._downloading = true;
    this._paintButtons();
    this.progressWrap.style.display = "flex";

    try {
      await apiJson("/pose_gallery/download/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      this._poll();
    } catch (e) {
      this._downloading = false;
      this._paintButtons();
      toast(t("dlStartFail", { msg: String(e.message || e) }));
    }
  }

  _poll() {
    clearInterval(this.timer);
    this.timer = setInterval(async () => {
      let st;
      try {
        st = await apiJson("/pose_gallery/download/status");
      } catch (e) {
        return;
      }
      const p = st.progress;
      this.barFg.style.width = `${p.percent || 0}%`;
      const failTxt = p.failed_files ? ` · ${p.failed_files} ✗` : "";
      this.progTxt.textContent =
        `${p.message || ""}  ` +
        t("dlFilesUnit", { done: p.done_files, total: p.total_files, pct: p.percent }) +
        `  ${p.bytes_mb} MB${failTxt}`;

      if (!p.running) {
        clearInterval(this.timer);
        this.timer = null;
        this._downloading = false;
        this.barFg.style.width = "100%";

        if (p.phase === "done") {
          toast(t("dlDone", { n: p.done_files, mb: p.bytes_mb }));
          try {
            const cfg = await apiJson("/pose_gallery/config");
            this.cfg = cfg;
            this.lib = cfg.library || {};
            this._paintInfo();
          } catch (e) {}
          this._paintButtons();
          if (this.onDone) this.onDone();
        } else if (p.error) {
          toast(t("dlProblem", { msg: p.error }));
          this._paintButtons();
        } else {
          this._paintButtons();
        }
      }
    }, 900);
  }

  close() {
    clearInterval(this.timer);
    document.removeEventListener("keydown", this._esc, true);
    if (this._offLang) this._offLang();
    this.mask.remove();
  }
}

/* 在任何姿态库节点上加一个「下载素材」按钮，并把下载状态作为 canvas 文字绘制在节点最底部 */
app.registerExtension({
  name: "PoseGallery.Downloader",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!["PoseGalleryLoader", "PoseGalleryAngleSet", "PoseGalleryBatchLoader"].includes(nodeData.name)) {
      return;
    }
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated ? onCreated.apply(this, arguments) : undefined;
      const node = this;

      const btn = node.addWidget("button", t("btnDownload"), null, () => {
        const panel = new DownloadPanel(() => {
          node.setDirtyCanvas(true, true);
          toast(t("dlDoneToast"));
          refreshDownloadState(node);
        });
        panel.init();
      });
      node._pgDlBtn = btn;

      /* 状态文本存到节点上，由 pose_gallery_node.js 的 onDrawForeground 统一绘制，
         与线稿预览共用同一套坐标，避免 DOM widget 定位错乱。 */
      node._pgDlText = "";
      node._pgDlColor = "#e0a03c";

      node._pgRelabelDl = () => {
        refreshDownloadState(node);
        node.setDirtyCanvas(true, true);
      };

      refreshDownloadState(node);
      return r;
    };

    /* 从工作流读回时也刷新一次状态 */
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
      refreshDownloadState(this);
      return r;
    };
  },
});

/**
 * 查询素材库是否就绪，更新按钮文字与节点上的状态文本（canvas 绘制）。
 * 未就绪 → 按钮「下载素材（首次使用）」+ 黄字提示；
 * 已就绪 → 按钮「✓ 素材已下载」+ 绿字「素材已下载 · N 个姿态 / M 张图」（同一行）。
 */
async function refreshDownloadState(node) {
  let ready = false;
  let info = null;
  try {
    const cfg = await apiJson("/pose_gallery/config");
    ready = cfg && cfg.ready === true;
    info = cfg;
  } catch (e) {
    ready = false;
  }
  const btn = node._pgDlBtn ||
    (node.widgets || []).find((w) => w.type === "button" && (
      w.name === t("btnDownload") || w.name === t("btnDownloaded")));
  if (ready) {
    if (btn) btn.name = t("btnDownloaded");
    /* 提示与数量合并为同一行 */
    const n = info && info.total_poses != null ? info.total_poses : 0;
    const m = info && info.total_images != null ? info.total_images : 0;
    node._pgDlText = t("dlStateReadyLine", { poses: n, images: m });
    node._pgDlColor = "#49c47c";
  } else {
    if (btn) btn.name = t("btnDownload");
    node._pgDlText = t("dlStateNotReady");
    node._pgDlColor = "#e0a03c";        /* 黄字提示 */
  }
  if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
  if (node.graph && node.graph.setDirtyCanvas) node.graph.setDirtyCanvas(true, true);
}

/* 语言切换时刷新所有节点的下载按钮 */
onLangChange(() => {
  const nodes = (app.graph && app.graph._nodes) || [];
  for (const n of nodes) {
    if (n._pgRelabelDl) n._pgRelabelDl();
  }
});

/* Pose Gallery —— 素材一键下载面板
 *
 * 为什么单独成文件：
 *   下载逻辑和图库选择器是两件事，分开便于维护，也避免 pose_gallery.js 过长。
 *
 * 定位：
 *   本插件（仓库里）**不分发任何图片**。这个面板做的事是：
 *   把素材从原作者站点下载到「用户自己这台机器」的目录里 ——
 *   即「用户个人获取」，不是「插件代用户再分发」。
 *
 * 原作者条款：允许作品制作中的商用/编辑/参考，禁止再分发/转载/转售图像本身。
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

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
  const t = el("div",
    "position:fixed;left:50%;bottom:34px;transform:translateX(-50%);" +
    "background:rgba(20,24,30,.97);color:#e9ecf1;border:1px solid #39404b;" +
    "padding:10px 18px;border-radius:10px;font-size:13px;z-index:20001;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:min(88vw,520px);text-align:center;" +
    "line-height:1.5;transition:opacity .2s", msg);
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, 3200);
}

/* ---------------------------------------------------------------- */

export class DownloadPanel {
  constructor(onDone) {
    this.onDone = onDone;
    this.timer = null;
    this._build();
  }

  _build() {
    const mask = el("div",
      "position:fixed;inset:0;z-index:20000;background:rgba(6,8,11,.84);" +
      "backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px");
    const box = el("div",
      "width:min(620px,94vw);background:#15181e;border:1px solid #2c323c;border-radius:14px;" +
      "box-shadow:0 24px 64px rgba(0,0,0,.6);color:#e6e9ee;overflow:hidden;" +
      "font:13px/1.6 system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif");

    /* 头 */
    const head = el("div",
      "display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #2c323c;background:#11141a");
    head.append(el("div", "font-size:15px;font-weight:700", "下载姿态素材"));
    const sp = el("div", "flex:1");
    const close = el("button",
      "width:32px;height:32px;border-radius:8px;border:1px solid #39404b;background:#1b1f27;" +
      "color:#cfd5de;cursor:pointer", "✕");
    close.onclick = () => this.close();
    head.append(sp, close);

    /* 说明 */
    const body = el("div", "padding:16px 18px;display:flex;flex-direction:column;gap:14px");
    body.append(el("div",
      "color:#a9b2c0;font-size:12.5px;line-height:1.7",
      "本插件不附带任何图片。点下面的按钮，会从原作者站点把素材下载到你这台电脑的本地目录，" +
      "下载后即可正常使用全部节点。素材版权归原作者所有，请勿再分发。"));

    /* 信息区 */
    const info = el("div",
      "background:#0f1217;border:1px solid #262c35;border-radius:10px;padding:12px 14px;" +
      "font-size:12.5px;color:#9aa3b1;line-height:1.8");
    info.innerHTML =
      "<div>素材总量：<b style='color:#e6e9ee'>288 个姿态 / 1439 张图</b></div>" +
      "<div>预计体积：约 <b style='color:#e6e9ee'>610 MB</b>（原图 590MB + 缩略图 22MB）</div>" +
      "<div>来源：<span style='color:#8fb4ff'>ai-pose-gallery.pages.dev</span>（作者 ギア）</div>";
    this.infoEl = info;
    body.append(info);

    /* 选项 */
    const opts = el("div", "display:flex;flex-direction:column;gap:10px");
    const mk = (id, label, checked, hint) => {
      const row = el("label", "display:flex;align-items:flex-start;gap:9px;cursor:pointer");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = checked;
      cb.style.cssText = "margin-top:3px;width:15px;height:15px;cursor:pointer";
      cb.id = id;
      const txt = el("div");
      txt.append(el("div", "color:#dfe4ec", label));
      if (hint) txt.append(el("div", "font-size:11.5px;color:#7d8592", hint));
      row.append(cb, txt);
      opts.append(row);
      return cb;
    };
    this.cbThumb = mk("pg-dl-thumb", "下载缩略图（约 22 MB）", true, "图库面板选图时要用，建议保留");
    this.cbFull = mk("pg-dl-full", "下载原图 PNG（约 590 MB）", true, "节点真正读的图，不下载则节点无法输出图片");
    this.cbSmall = mk("pg-dl-small", "只下前 20 个姿态（先试水，约 40 MB）", false, "想先看看效果就勾这个，之后再补全");
    body.append(opts);

    /* 进度条 */
    const progWrap = el("div", "display:none;flex-direction:column;gap:6px");
    const barBg = el("div", "height:8px;background:#22272f;border-radius:99px;overflow:hidden");
    const barFg = el("div", "height:100%;width:0%;background:linear-gradient(90deg,#3b6fe0,#5b8ef7);transition:width .3s");
    barBg.append(barFg);
    const progTxt = el("div", "font-size:12px;color:#9aa3b1");
    progWrap.append(barBg, progTxt);
    this.progressWrap = progWrap;
    this.barFg = barFg;
    this.progTxt = progTxt;
    body.append(progWrap);

    /* 底部按钮 */
    const foot = el("div",
      "display:flex;gap:10px;justify-content:flex-end;padding:14px 18px;border-top:1px solid #2c323c;background:#11141a");
    this.btnLater = el("button",
      "height:34px;padding:0 16px;border-radius:8px;border:1px solid #39404b;background:#1b1f27;" +
      "color:#cfd5de;cursor:pointer", "以后再说");
    this.btnLater.onclick = () => this.close();
    this.btnStart = el("button",
      "height:34px;padding:0 18px;border-radius:8px;border:1px solid #4a7cf0;" +
      "background:#3b6fe0;color:#fff;font-weight:600;cursor:pointer", "开始下载");
    this.btnStart.onclick = () => this.start();
    foot.append(this.btnLater, this.btnStart);

    box.append(head, body, foot);
    mask.append(box);
    this.mask = mask;
    this.box = box;
    document.body.appendChild(mask);

    this._esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); this.close(); } };
    document.addEventListener("keydown", this._esc, true);
  }

  async init() {
    try {
      const cfg = await apiJson("/pose_gallery/config");
      const lib = cfg.library || {};
      const lines = [];
      lines.push(`<div>素材总量：<b style='color:#e6e9ee'>288 个姿态 / 1439 张图</b></div>`);
      lines.push(`<div>预计体积：约 <b style='color:#e6e9ee'>610 MB</b>（原图 590MB + 缩略图 22MB）</div>`);
      lines.push(`<div>保存到：<span style='color:#8fb4ff;word-break:break-all'>${lib.path || cfg.library_dir || "?"}</span></div>`);
      lines.push(`<div>当前状态：${lib.ready
        ? `<b style='color:#49c47c'>已就绪</b>（${lib.images} 张原图 / ${lib.thumbs} 张缩略图）`
        : `<b style='color:#e0a03c'>尚未下载</b>`}</div>`);
      this.infoEl.innerHTML = lines.join("");
      if (lib.ready) {
        this.btnStart.textContent = "重新检查 / 补全缺失";
      }

      // 若已有下载在跑，直接接管进度显示
      const st = await apiJson("/pose_gallery/download/status");
      if (st.progress && st.progress.running) {
        this.progressWrap.style.display = "flex";
        this.btnStart.disabled = true;
        this.btnStart.style.opacity = ".55";
        this.btnStart.textContent = "下载中…";
        this._poll();
      }
    } catch (e) {
      this.infoEl.innerHTML =
        `<span style='color:#ff8f8f'>读取状态失败：${String(e.message || e)}</span>`;
    }
  }

  async start() {
    const body = {
      thumbs: this.cbThumb.checked,
      fulls: this.cbFull.checked,
      workers: 10,
    };
    if (!body.thumbs && !body.fulls) {
      toast("至少要勾选一种（缩略图或原图）");
      return;
    }
    if (this.cbSmall.checked) body.limit_poses = 20;

    this.btnStart.disabled = true;
    this.btnStart.style.opacity = ".55";
    this.btnStart.textContent = "下载中…";
    this.progressWrap.style.display = "flex";

    try {
      await apiJson("/pose_gallery/download/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      this._poll();
    } catch (e) {
      this.btnStart.disabled = false;
      this.btnStart.style.opacity = "1";
      this.btnStart.textContent = "开始下载";
      toast("启动失败：" + String(e.message || e));
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
      const failTxt = p.failed_files ? ` · 失败 ${p.failed_files}` : "";
      this.progTxt.textContent =
        `${p.message || ""}  ${p.done_files}/${p.total_files}（${p.percent}%）` +
        `  ${p.bytes_mb} MB${failTxt}`;

      if (!p.running) {
        clearInterval(this.timer);
        this.timer = null;
        this.btnStart.disabled = false;
        this.btnStart.style.opacity = "1";
        this.btnStart.textContent = "重新检查 / 补全缺失";
        this.barFg.style.width = "100%";

        if (p.phase === "done") {
          toast(`下载完成：${p.done_files} 个文件，${p.bytes_mb} MB`);
          // 刷新信息区
          try {
            const cfg = await apiJson("/pose_gallery/config");
            const lib = cfg.library || {};
            this.infoEl.innerHTML =
              `<div>素材总量：<b style='color:#e6e9ee'>288 个姿态 / 1439 张图</b></div>` +
              `<div>保存到：<span style='color:#8fb4ff;word-break:break-all'>${lib.path || "?"}</span></div>` +
              `<div>当前状态：<b style='color:#49c47c'>已就绪</b>（${lib.images} 张原图 / ${lib.thumbs} 张缩略图）</div>`;
          } catch (e) {}
          if (this.onDone) this.onDone();
        } else if (p.error) {
          toast("下载有问题：" + p.error);
        }
      }
    }, 900);
  }

  close() {
    clearInterval(this.timer);
    document.removeEventListener("keydown", this._esc, true);
    this.mask.remove();
  }
}

/* 在任何姿态库节点上加一个「下载素材」按钮（只加一次） */
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

      node.addWidget("button", "⤓ 下载素材（首次使用）", null, async () => {
        const panel = new DownloadPanel(() => {
          node.setDirtyCanvas(true, true);
          toast("素材已就绪，重新排队执行即可读到图");
        });
        panel.init();
      });

      return r;
    };
  },
});

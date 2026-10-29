/* Pose Gallery —— 面板多语言（中文 / 日本語 / English）
 *
 * 设计：
 *   · 默认中文（zh）
 *   · 选择持久化到 localStorage，刷新/重开面板后保持
 *   · 只翻译「界面文案」；数据本身的名字（中文名 / 日文原名）不受影响
 *   · 纯前端模块，无后端依赖；各面板 import 后用 t() 取文案
 */

const STORAGE_KEY = "pose-gallery-lang";
export const LANGS = ["zh", "ja", "en"];
export const LANG_LABELS = { zh: "中文", ja: "日本語", en: "English" };
export const DEFAULT_LANG = "zh";

/* ---------------- 词典 ---------------- */
const DICT = {
  zh: {
    /* 通用 */
    appTitle: "姿态素材库",
    loading: "加载中…",
    close: "关闭",
    cancel: "取消",
    confirm: "确定",
    ok: "好的",
    error: "错误",
    retry: "重试",
    unknown: "未知",

    /* 图库选择面板 */
    filterSystem: "系统",
    filterCategory: "分类",
    filterAngle: "角度",
    allSystem: "系统：全部",
    allCategory: "分类：全部",
    allAngle: "角度：全部",
    searchPlaceholder: "搜索名称 / 编号 / 分类…",
    selectedN: "已选 {n} 项",
    poseTotal: "共 {total} 个姿态 · 已显示 {shown}",
    multiHint: " · 可多选",
    singleHint: " · 单选",
    loadMore: "加载更多",
    clearSelection: "清空选择",
    btnOk: "确定",
    emptyResult: "没有符合条件的姿态",
    emptyHint: "换个筛选条件试试",
    configFail: "读取图库配置失败：{msg}",
    listFail: "读取姿态列表失败：{msg}",
    posesUnit: "姿态",
    imagesUnit: "张",
    libNotReadyShort: "素材库未就绪",
    libNotReadyTitle: "素材库还没准备好",
    libNotReadyHint: "先关掉这个面板，在节点上点「⤓ 下载素材（首次使用）」把素材下到本机；下完再打开本面板即可。",
    libNotReadyPath: "默认存放位置：{path}",
    thumbWidthTip: "缩略图宽度 {px}px",
    panelResizeTip: "拖动调整面板大小",

    /* 节点按钮与状态 */
    btnOpenPicker: "① 打开图库选择",
    btnClear: "② 清空选择",
    btnShowSketch: "③ 展示线稿图",
    btnDownloaded: "✓ 素材已下载",
    dlStateNotReady: "⚠ 素材未下载：点下面的「下载素材」按钮获取（约 650MB）",
    dlStateReady: "✓ 素材已下载：{poses} 个姿态 / {images} 张图",
    dlStateReadyLine: "✓ 素材已下载 · {poses} 个姿态 / {images} 张图",
    dlBtnReadyLine: "✓ 素材已下载 · {poses} 个姿态 / {images} 张图",
    dlStateReadyShort: "✓ 素材已下载",
    btnDownload: "⤓ 下载素材（首次使用）",
    notSelected: "未选择",
    selectedOne: "{id}",
    selectedMany: "已选 {n} 项",

    /* 下载面板 */
    dlTitle: "下载姿态素材",
    dlIntro:
      "本插件不附带任何图片。点下面的按钮，会从原作者站点把素材下载到你这台电脑的本地目录，" +
      "下载后即可正常使用全部节点。素材版权归原作者所有，请勿再分发。",
    dlTotal: "素材总量",
    dlEstSize: "预计体积",
    dlSaveTo: "保存到",
    dlStatus: "当前状态",
    dlReady: "已就绪",
    dlNotReady: "尚未下载",
    dlReadyDetail: "{imgs} 张原图 / {thumbs} 张缩略图",
    dlOptThumbs: "下载缩略图（约 22 MB）",
    dlOptThumbsHint: "图库面板选图时要用，建议保留",
    dlOptFulls: "下载原图 PNG（约 590 MB）",
    dlOptFullsHint: "节点真正读的图，不下载则节点无法输出图片",
    dlOptSmall: "只下前 20 个姿态（先试水，约 40 MB）",
    dlOptSmallHint: "想先看看效果就勾这个，之后再补全",
    dlStart: "开始下载",
    dlDownloading: "下载中…",
    dlRecheck: "重新检查 / 补全缺失",
    dlLater: "以后再说",
    dlNeedOne: "至少要勾选一种（缩略图或原图）",
    dlStartFail: "启动失败：{msg}",
    dlDone: "下载完成：{n} 个文件，{mb} MB",
    dlDoneToast: "素材已就绪，重新排队执行即可读到图",
    dlProblem: "下载有问题：{msg}",
    dlStateFail: "读取状态失败：{msg}",
    dlFilesUnit: "{done}/{total}（{pct}%）",

    /* 语言切换 */
    langLabel: "语言",
  },

  ja: {
    appTitle: "ポーズ素材庫",
    loading: "読み込み中…",
    close: "閉じる",
    cancel: "キャンセル",
    confirm: "OK",
    ok: "OK",
    error: "エラー",
    retry: "再試行",
    unknown: "不明",

    filterSystem: "系統",
    filterCategory: "分類",
    filterAngle: "アングル",
    allSystem: "系統：すべて",
    allCategory: "分類：すべて",
    allAngle: "アングル：すべて",
    searchPlaceholder: "名前 / ID / 分類で検索…",
    selectedN: "{n} 件選択中",
    poseTotal: "全 {total} ポーズ · {shown} 件表示",
    multiHint: " · 複数選択可",
    singleHint: " · 単一選択",
    loadMore: "さらに読み込む",
    clearSelection: "選択をクリア",
    btnOk: "決定",
    emptyResult: "条件に合うポーズがありません",
    emptyHint: "絞り込み条件を変えてみてください",
    configFail: "ギャラリー設定の読み込みに失敗：{msg}",
    listFail: "ポーズ一覧の読み込みに失敗：{msg}",
    posesUnit: "ポーズ",
    imagesUnit: "枚",
    libNotReadyShort: "素材ライブラリ未準備",
    libNotReadyTitle: "素材ライブラリがまだ準備できていません",
    libNotReadyHint: "このパネルを閉じ、ノードの「⤓ 素材をダウンロード（初回）」を押して素材を取得してください。完了後にこのパネルを開き直してください。",
    libNotReadyPath: "既定の保存先：{path}",
    thumbWidthTip: "サムネイル幅 {px}px",
    panelResizeTip: "ドラッグでパネルのサイズを変更",

    btnOpenPicker: "① ギャラリーから選ぶ",
    btnClear: "② 選択をクリア",
    btnShowSketch: "③ 線画を表示",
    btnDownloaded: "✓ 素材ダウンロード済み",
    dlStateNotReady: "⚠ 素材未ダウンロード：「素材をダウンロード」を押してください（約 650MB）",
    dlStateReady: "✓ 素材ダウンロード済み：{poses} ポーズ / {images} 枚",
    dlStateReadyLine: "✓ 素材ダウンロード済み · {poses} ポーズ / {images} 枚",
    dlBtnReadyLine: "✓ 素材ダウンロード済み · {poses} ポーズ / {images} 枚",
    dlStateReadyShort: "✓ 素材ダウンロード済み",
    btnDownload: "⤓ 素材をダウンロード（初回）",
    notSelected: "未選択",
    selectedOne: "{id}",
    selectedMany: "{n} 件選択中",

    dlTitle: "ポーズ素材をダウンロード",
    dlIntro:
      "本プラグインに画像は同梱されていません。下のボタンを押すと、原作者のサイトから" +
      "この PC のローカルフォルダへ素材をダウンロードします。ダウンロード後は全てのノードが使えます。" +
      "素材の著作権は原作者に帰属します。再配布はしないでください。",
    dlTotal: "素材総数",
    dlEstSize: "推定サイズ",
    dlSaveTo: "保存先",
    dlStatus: "現在の状態",
    dlReady: "準備完了",
    dlNotReady: "未ダウンロード",
    dlReadyDetail: "原寸 {imgs} 枚 / サムネ {thumbs} 枚",
    dlOptThumbs: "サムネイルをダウンロード（約 22 MB）",
    dlOptThumbsHint: "ギャラリーの一覧表示に必要です。残すことを推奨",
    dlOptFulls: "原寸 PNG をダウンロード（約 590 MB）",
    dlOptFullsHint: "ノードが実際に読み込む画像。未取得だと画像を出力できません",
    dlOptSmall: "最初の 20 ポーズだけ（お試し・約 40 MB）",
    dlOptSmallHint: "まず動作を見たい場合はこれをチェック。後から追加取得できます",
    dlStart: "ダウンロード開始",
    dlDownloading: "ダウンロード中…",
    dlRecheck: "再確認 / 不足分を補完",
    dlLater: "あとで",
    dlNeedOne: "少なくとも 1 つ（サムネイルか原寸）を選んでください",
    dlStartFail: "開始に失敗：{msg}",
    dlDone: "ダウンロード完了：{n} ファイル、{mb} MB",
    dlDoneToast: "素材の準備ができました。再実行すると画像を読み込めます",
    dlProblem: "ダウンロードで問題が発生：{msg}",
    dlStateFail: "状態の読み込みに失敗：{msg}",
    dlFilesUnit: "{done}/{total}（{pct}%）",

    langLabel: "言語",
  },

  en: {
    appTitle: "Pose Library",
    loading: "Loading…",
    close: "Close",
    cancel: "Cancel",
    confirm: "OK",
    ok: "OK",
    error: "Error",
    retry: "Retry",
    unknown: "Unknown",

    filterSystem: "System",
    filterCategory: "Category",
    filterAngle: "Angle",
    allSystem: "System: All",
    allCategory: "Category: All",
    allAngle: "Angle: All",
    searchPlaceholder: "Search name / ID / category…",
    selectedN: "{n} selected",
    poseTotal: "{total} poses · showing {shown}",
    multiHint: " · multi-select",
    singleHint: " · single select",
    loadMore: "Load more",
    clearSelection: "Clear selection",
    btnOk: "OK",
    emptyResult: "No poses match your filters",
    emptyHint: "Try changing the filters",
    configFail: "Failed to load gallery config: {msg}",
    listFail: "Failed to load pose list: {msg}",
    posesUnit: "poses",
    imagesUnit: "images",
    libNotReadyShort: "Library not ready",
    libNotReadyTitle: "The pose library is not ready yet",
    libNotReadyHint: "Close this panel and click \"⤓ Download assets (first run)\" on the node to fetch the assets, then reopen this panel.",
    libNotReadyPath: "Default location: {path}",
    thumbWidthTip: "Thumbnail width {px}px",
    panelResizeTip: "Drag to resize panel",

    btnOpenPicker: "① Open picker",
    btnClear: "② Clear selection",
    btnShowSketch: "③ Show sketch",
    btnDownloaded: "✓ Assets downloaded",
    dlStateNotReady: "⚠ Assets not downloaded yet — click 'Download assets' below (~650MB)",
    dlStateReady: "✓ Assets downloaded: {poses} poses / {images} images",
    dlStateReadyLine: "✓ Assets downloaded · {poses} poses / {images} images",
    dlBtnReadyLine: "✓ Assets downloaded · {poses} poses / {images} images",
    dlStateReadyShort: "✓ Assets downloaded",
    btnDownload: "⤓ Download assets (first run)",
    notSelected: "No selection",
    selectedOne: "{id}",
    selectedMany: "{n} selected",

    dlTitle: "Download pose assets",
    dlIntro:
      "This plugin bundles no images. Clicking below downloads the assets from the " +
      "original author's site onto your own machine, after which all nodes work. " +
      "Assets remain the property of the original author — do not redistribute them.",
    dlTotal: "Total assets",
    dlEstSize: "Estimated size",
    dlSaveTo: "Saved to",
    dlStatus: "Status",
    dlReady: "Ready",
    dlNotReady: "Not downloaded",
    dlReadyDetail: "{imgs} full images / {thumbs} thumbnails",
    dlOptThumbs: "Download thumbnails (~22 MB)",
    dlOptThumbsHint: "Needed for the picker grid — recommended",
    dlOptFulls: "Download full-size PNGs (~590 MB)",
    dlOptFullsHint: "What the nodes actually read; without these no images are output",
    dlOptSmall: "First 20 poses only (trial, ~40 MB)",
    dlOptSmallHint: "Tick this to try it out, then fetch the rest later",
    dlStart: "Start download",
    dlDownloading: "Downloading…",
    dlRecheck: "Re-check / fill missing",
    dlLater: "Later",
    dlNeedOne: "Pick at least one (thumbnails or full images)",
    dlStartFail: "Failed to start: {msg}",
    dlDone: "Download finished: {n} files, {mb} MB",
    dlDoneToast: "Assets are ready — re-queue to read images",
    dlProblem: "Download problem: {msg}",
    dlStateFail: "Failed to read status: {msg}",
    dlFilesUnit: "{done}/{total} ({pct}%)",

    langLabel: "Language",
  },
};

/* ---------------- 状态 ---------------- */

let current = DEFAULT_LANG;
const listeners = new Set();

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && LANGS.includes(v)) return v;
  } catch (e) {}
  return DEFAULT_LANG;
}

/* 初始化：读本地存储 */
current = readStored();

/* ---------------- 对外 API ---------------- */

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {}
  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch (e) {}
  });
}

/** 订阅语言变化；返回取消订阅函数 */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 取文案。支持 {name} 占位符替换。
 * 找不到 key 时回退：当前语言 → 中文 → key 本身。
 */
export function t(key, vars) {
  const d = DICT[current] || DICT[DEFAULT_LANG];
  let s = d[key];
  if (s == null) s = DICT[DEFAULT_LANG][key];
  if (s == null) return key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split("{" + k + "}").join(String(vars[k]));
    }
  }
  return s;
}

/** 生成一个语言切换按钮组（三个小按钮），挂到任意容器上 */
export function makeLangSwitcher(onChanged) {
  const wrap = document.createElement("div");
  wrap.className = "pg-lang-switch";
  wrap.style.cssText =
    "display:inline-flex;gap:2px;padding:2px;border:1px solid #39404b;border-radius:7px;background:#0f1217";

  const btns = {};
  for (const lang of LANGS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = LANG_LABELS[lang];
    b.dataset.lang = lang;
    b.style.cssText =
      "height:24px;padding:0 9px;border:0;border-radius:5px;cursor:pointer;" +
      "font-size:11.5px;background:transparent;color:#9aa3b1;transition:background .12s,color .12s";
    b.onclick = () => {
      setLang(lang);
      paint();
      if (onChanged) onChanged(lang);
    };
    btns[lang] = b;
    wrap.append(b);
  }

  function paint() {
    for (const lang of LANGS) {
      const active = lang === current;
      btns[lang].style.background = active ? "#2f6fed" : "transparent";
      btns[lang].style.color = active ? "#fff" : "#9aa3b1";
      btns[lang].style.fontWeight = active ? "600" : "400";
    }
  }

  paint();
  /* 语言被别处改动时同步高亮 */
  onLangChange(() => paint());

  return wrap;
}

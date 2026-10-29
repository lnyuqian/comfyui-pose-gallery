/* Pose Gallery —— 插件入口

 本文件只做模块聚合。具体实现已拆分到：
   pose_gallery_shared.js  —— 常量与 localStorage 读写
   pose_gallery_panel.js   —— 图库选择面板 PickerPanel
   pose_gallery_node.js    —— 节点挂载、选择状态、内联线稿预览
   pose_gallery_downloader.js —— 素材下载面板与下载按钮
   pose_gallery_i18n.js    —— 中文 / 日本語 / English 文案

 ComfyUI 会按扩展目录加载全部 .js，各模块自行 registerExtension。
 */

import "./pose_gallery_shared.js";
import "./pose_gallery_panel.js";
import "./pose_gallery_node.js";

# 数据来源与致谢 / Data Source & Attribution

> 本文同时以中文和英文书写，便于国际用户理解。
> This document is written in both Chinese and English for international readers.

---

## 一、素材著作权说明 / Copyright of the Assets

本仓库（`comfyui-pose-gallery`）**不包含任何图片、缩略图或姿态数据**。
本仓库只包含读取本地素材的**工具代码**。

This repository (`comfyui-pose-gallery`) **contains no images, thumbnails, or pose data**.
It only contains **tool code** that reads a local asset library.

---

## 二、素材来源 / Asset Source

| 项目 / Item | 内容 / Detail |
| --- | --- |
| 素材名称 / Name | ポーズ集 POSE-DB-01 |
| 作者 / Author | **ギア**（Gear） |
| 作者 X (Twitter) | <https://x.com/giaaibusi> |
| 素材站点 / Site | <https://ai-pose-gallery.pages.dev/> |
| 内容 / Content | 无脸灰色人偶线稿（3:4），全身 / 上半身 / 双人，每个姿态 5 个角度 |
| 规模 / Scale | 288 个姿态 / 1439 张图 |

### 原作者的授权声明（转述）/ Original Author's Terms (as stated on their site)

- ✅ 可免费使用；**在作品制作中的商用、编辑、参考使用均允许**
  Free to use; **commercial use in works, editing, and reference use are all permitted**
- ❌ **禁止再分发、转载、转售图像数据本身**（含原尺寸与加工版本）
  **Redistribution, reposting, or resale of the image data itself** (including original-size and modified versions) **is prohibited**
- ℹ️ 无需标注出处（可选）；图像元数据已清除；不提供任何保证
  No credit required (optional); metadata stripped; no warranty

---

## 三、本仓库的立场 / Our Position

1. **著作权完全归原作者 ギア 所有。**
   本仓库作者不主张任何与素材相关的权利。

   **All copyright in the assets belongs entirely to the original author, ギア.**
   The maintainers of this repository claim no rights whatsoever over the assets.

2. **本仓库不分发素材。**
   仓库内没有任何 `.png` / `.jpg` 素材文件、没有素材索引数据文件。

   **This repository does not redistribute assets.**
   There are no asset files (`.png` / `.jpg`) and no asset index data files in this repository.

   > **关于「一键下载」功能 / About the built-in downloader**
   >
   > 插件内置了一个**下载助手**（节点上的「⤓ 下载素材」按钮）。
   > 它的行为是：**从原作者站点把素材下载到用户自己这台机器的目录**，
   > 与「用户自己用浏览器去原站下载」在性质上完全相同，只是省了手动步骤。
   >
   > 关键点：
   > - 素材**始终由用户自己的机器向原作者服务器请求**，我们的代码不参与中转
   > - 仓库、Release、任何分发渠道中**都不包含素材文件**
   > - 下载得到的素材**只存在于用户本机**，插件不会上传或转发给任何第三方
   > - 界面上明确提示「素材版权归原作者，请勿再分发」
   >
   > 换言之：这**不是**「插件代你分发素材」，而是「插件帮你从原作者那里取到本地」。
   > 真正下载到的是**用户机器上的副本**，由用户自己承担原作者的条款约束。
   > 若原作者认为此方式有异议，我们会立即移除该下载功能。
   >
   > The plugin ships a **download helper** (the "⤓ Download assets" button).
   > It fetches assets **from the original author's site to the user's own machine** —
   > functionally identical to the user downloading them manually in a browser.
   >
   > Key points:
   > - Assets are always requested **from the user's machine to the author's server**;
   >   our code never relays or proxies them
   > - **No asset files** are included in the repo, releases, or any distribution channel
   > - Downloaded assets live **only on the user's machine**; the plugin never uploads
   >   or forwards them anywhere
   > - The UI explicitly states "assets belong to the original author; do not redistribute"
   >
   > In other words, this is **not** "the plugin redistributing assets for you", but
   > "the plugin fetching them from the author to your local disk".
   > The copy lives on the user's own machine, and the user is bound by the author's terms.
   > If the author disagrees, we will remove the downloader immediately.

3. **本插件是通用工具，不绑定单一素材库。**
   任何符合 [README 数据格式](README.md#数据格式) 的姿态库都能使用，包括使用者自己制作的素材。
   此外，代码中的**自动探测只限于插件目录及其上一级**，刻意不包含任何指向某个特定第三方素材库的硬编码路径 ——
   插件不会主动去翻别的目录找素材，必须由使用者显式配置路径。

   **This plugin is a general-purpose tool and is not bound to any single asset library.**
   Any pose library matching the [data format](README.md#数据格式) works, including assets you create yourself.
   Auto-detection is intentionally limited to the plugin directory and its parent;
   there are no hard-coded paths pointing at any specific third-party asset library.

4. **本插件与原作者的官方产品无关。**
   这是第三方、非官方工具。我们正在主动向原作者申请许可（见 [docs/PERMISSION-REQUEST.md](docs/PERMISSION-REQUEST.md)）。

   **This plugin is not affiliated with the original author's official products.**
   It is a third-party, unofficial tool. We are proactively requesting permission
   (see [docs/PERMISSION-REQUEST.md](docs/PERMISSION-REQUEST.md)).

5. **尊重原作者意愿。**
   若原作者对本仓库有任何异议，我们会**立即**修改、限制或下架本仓库。

   **We respect the original author's wishes.**
   If the original author objects, we will **immediately** modify, restrict, or take down this repository.

---

## 四、给使用者的提醒 / A Note to Users

如果你打算使用这个素材库：

1. 先去原站阅读并遵守原作者的使用条款
   Read and follow the original author's terms on their site first
2. **不要**把素材再上传、打包分发或出售
   **Do not** re-upload, bundle, redistribute, or sell the assets
3. 在自己作品中使用时，建议（非强制）标注出处
   When using in your own works, crediting the author is recommended (not required)
4. 考虑关注原作者以示支持：<https://x.com/giaaibusi>
   Consider following the author to show support: <https://x.com/giaaibusi>

---

## 五、技术参考致谢 / Technical References

本插件在架构与交互设计上参考了以下开源项目（按 GitHub star 排序，2026-10 数据）。
**仅参考设计模式，未复制源码。**

This plugin's architecture and interaction design were informed by the following open-source projects
(sorted by GitHub stars, as of 2026-10). **Design patterns only; no source code was copied.**

| # | 仓库 / Repository | ★ | 借鉴点 / What we learned |
| --- | --- | --- | --- |
| 1 | [netaart/comfyui-browser](https://github.com/netaart/comfyui-browser) | 680 | 后端路由 + 前端面板分离，不把海量条目塞进 widget / backend-routes + frontend-panel separation |
| 2 | [ZHO-ZHO-ZHO/ComfyUI-ArtGallery](https://github.com/ZHO-ZHO-ZHO/ComfyUI-ArtGallery) | 560 | 点缩略图即选的交互范式 / click-thumbnail-to-select interaction |
| 3 | [biagiomaf/smart-comfyui-gallery](https://github.com/biagiomaf/smart-comfyui-gallery) | 396 | 本地优先、元数据与图片分离 / local-first, metadata separated from images |
| 4 | [BigStationW/ComfyUi-ImageGalleryLoader](https://github.com/BigStationW/ComfyUi-ImageGalleryLoader) | 50 | hidden widget 回传选择结果 / passing selection via hidden widget |
| 5 | [PanicTitan/ComfyUI-Gallery](https://github.com/PanicTitan/ComfyUI-Gallery) | 117 | 实时预览与元信息展示 / live preview and metadata display |

以上项目的许可证归各自作者所有。
Each project is licensed by its respective authors.

---

## 六、联系方式 / Contact

如对署名方式、授权范围有异议，请通过以下方式联系：

For any concerns about attribution or licensing scope, please contact:

- GitHub Issue：<https://github.com/lnyuqian/comfyui-pose-gallery/issues>
- 原作者 / Original author：<https://x.com/giaaibusi>

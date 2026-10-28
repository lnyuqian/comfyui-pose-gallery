# ComfyUI Pose Gallery

把**本地姿态素材库**接进 ComfyUI：按「单张 / 一组 5 角度 / 批量（跨分类）」取图，输出图片与编号元信息，供其它节点读取。

**装上即可用**：节点上有「⤓ 下载素材（首次使用）」按钮，点一下自动把素材从原作者站点下载到你的本机。

> ## ✅ 已在真实 ComfyUI 中实测通过
>
> 本插件已在一个真实的 ComfyUI（v0.37.0 / 前端 1.53.6 / Python 3.10 / torch 2.9）中完整跑通，
> 包括节点注册、图库面板、素材下载、以及**接入 Qwen-Image-2.1 图生图的完整出图链路**。
>
> ### 已验证 / What has been verified
>
> | 项目 | 结果 |
> | --- | --- |
> | 4 个节点注册 | ✅ 启动日志显示已加载，`object_info` 与前端节点面板均可检索到 |
> | 中文 Windows（GBK 控制台）启动 | ✅ 已修复非 GBK 字符导致的导入崩溃 |
> | 图库面板 | ✅ 288 姿态 / 1439 图全部可浏览，缩略图正常渲染 |
> | 缩略图比例 | ✅ 严格 3:4（90×120 / 120×160 / 150×200 三档宽度） |
> | 面板自由缩放 | ✅ 右下角拖拽可拉宽拉高，尺寸自动记忆 |
> | 节点内联线稿预览 | ✅ 选完直接在节点上显示线稿图，无需再开面板 |
> | 素材一键下载 | ✅ 288 姿态 / 1439 图 / 约 655MB，断点续传 |
> | 单张生图（Qwen-Image-2.1） | ✅ 12 秒出图，姿态准确跟随 |
> | 批量生图 | ✅ `PoseGalleryBatchLoader` + `RepeatLatentBatch` 一次出多张，各张姿态独立 |
>
> ### 已知限制 / Known limits
>
> - 姿态库是**线稿人体模型**，因此 DWPose / OpenPose 等骨骼检测节点**无法识别**
>   （它们依赖真实人体特征）。若需骨骼控制，请改用「线稿 → 视觉模型转文字 → 合并提示词」的方式。
> - 批量生图时，`PoseGalleryBatchLoader` 的 `limit` 与 `RepeatLatentBatch` 的 `amount`
>   需要手动保持一致。
> - Qwen-Image-2.1 若不加着装类负面词，容易生成裸体，建议在 `negative_prompt` 里明确约束。
>
> > ## ✅ Tested in a real ComfyUI
> >
> > Verified on ComfyUI v0.37.0 (frontend 1.53.6, Python 3.10, torch 2.9): node registration,
> > the picker panel, the asset downloader, and a full **Qwen-Image-2.1 image-to-image**
> > generation chain. Thumbnails render at an exact 3:4 aspect with three width presets
> > (90 / 120 / 150 px); the panel is freely resizable and remembers its size; selected
> > sketches are shown inline on the node.
> >
> > **Known limits:** the library contains line-art mannequins, so skeleton detectors
> > (DWPose / OpenPose) cannot parse them — use a vision-model caption route instead if you
> > need skeletal control. For batch generation keep `limit` and `amount` in sync.

> ⚠️ **本仓库不包含任何图片或姿态数据。** 只包含读取工具（代码）。
> 数据需由使用者自行从原始站点获取，并遵守原作者的使用条款 —— 详见 [ATTRIBUTION.md](ATTRIBUTION.md)。

---

## 目录

- [这是什么](#这是什么)
- [✅ 测试状态](#-测试状态--test-status)
- [数据来源与致谢](#数据来源与致谢)
- [技术参考](#技术参考)
- [安装](#安装)
- [四个节点](#四个节点)
- [输出口](#输出口)
- [图库选择面板](#图库选择面板)
- [缩略图比例与尺寸](#缩略图比例与尺寸34)
- [面板可自由缩放](#面板可自由缩放)
- [节点内联线稿预览](#节点内联线稿预览)
- [下拉筛选（不用面板时）](#下拉筛选不用面板时)
- [数据格式](#数据格式)
- [已知边界](#已知边界)
- [授权状态](#授权状态)
- [许可证](#许可证)

---

## 这是什么

一个 ComfyUI 自定义节点包。本身**不含素材**，而是一个「素材库浏览器 + 读取器」：

- 读一份本地 JSON 索引（描述有哪些姿态、每个姿态对应哪几个角度的图片文件）
- 在 ComfyUI 里提供可视化选择面板
- 把选中的图片读成 `IMAGE` 张量，同时把编号 / 名称 / 路径等元信息一起输出

零第三方依赖，只用 Python 标准库 + ComfyUI 自带的 `torch` / `PIL` / `numpy`。

---

## ✅ 测试状态 / Test Status

**已在真实 ComfyUI 中完整跑通**（ComfyUI v0.37.0 / 前端 1.53.6 / Python 3.10 / torch 2.9）。

### 已验证 / Verified

| 项目 | 实测结果 |
| --- | --- |
| 4 个节点注册 | ✅ 前端节点面板可检索（分类 `Pose Gallery`） |
| GBK 控制台启动 | ✅ 已修复非 GBK 字符导致的 `UnicodeEncodeError` 导入崩溃 |
| 图库面板 | ✅ 288 姿态 / 1439 图，缩略图正常渲染 |
| 缩略图 3:4 比例 | ✅ 90×120 / 120×160 / 150×200 三档可选 |
| 面板自由缩放 | ✅ 拖拽右下角拉宽拉高，尺寸记忆 |
| 节点内联线稿 | ✅ 选完直接在节点上显示，无需重开面板 |
| 素材下载 | ✅ 约 655MB，断点续传，失败可重试 |
| 单张生图 | ✅ 接入 Qwen-Image-2.1，12 秒出图，姿态准确 |
| 批量生图 | ✅ 一次多张，各张姿态独立 |

### 已知限制 / Known Limits

- 姿态图是**线稿人体模型**，DWPose / OpenPose 等骨骼检测节点**无法识别**（依赖真实人体特征）。
  需要骨骼控制时，请用「线稿 → 视觉模型转文字 → 合并提示词」路线。
- 批量生图需保持 `limit` 与 `RepeatLatentBatch.amount` 一致。
- Qwen-Image-2.1 缺少着装负面词时容易生成裸体，建议明确约束 `negative_prompt`。

### 出问题怎么办 / If something breaks

1. 启动报 `UnicodeEncodeError` → 更新到包含 `_safe_print` 的版本
2. 面板空白无图 → 检查 `/pose_gallery/config` 返回的 `ready` 是否为 `true`
3. 节点搜不到 → 重启 ComfyUI 后**刷新浏览器页面**
4. 欢迎反馈：<https://github.com/lnyuqian/comfyui-pose-gallery/issues>

## 数据来源与致谢

本插件的设计目标，是读取下面这个姿态素材库：

| 项目 | 内容 |
| --- | --- |
| 素材名称 | ポーズ集 POSE-DB-01（姿态素材集） |
| 作者 | **ギア**（Gear） |
| 作者 X (Twitter) | <https://x.com/giaaibusi> |
| 素材站点 | <https://ai-pose-gallery.pages.dev/> |
| 内容 | 无脸灰色人偶线稿，全身/上半身/双人，每个姿态 5 个角度 |
| 原站授权声明 | 允许作品制作中的商用、编辑、参考使用；**禁止再分发 / 转载 / 转售图像数据本身** |

> **原作者的公开声明（2026-10-28）**：
> 「画像データ自体の再配布、販売はNGですが、それ以外の活用方法は全部OKです」
> （图像数据本身的再分发、销售是 NG，除此之外的活用方法全部 OK）
> —— [原推文](https://x.com/giaaibusi/status/2115302275686207681)

**我们对原作者的立场**：

- 素材的**全部著作权归原作者 ギア 所有**。本仓库不主张任何素材相关权利。
- 本仓库**不包含**任何原站图片、缩略图或姿态数据文件。
- 本插件只是「读本地文件的工具」，类似一个图片浏览器，不改变、不再分发原素材。
- 我们已在 [docs/PERMISSION-REQUEST.md](docs/PERMISSION-REQUEST.md) 中准备了一份中日文对照的授权申请，正主动向原作者申请许可与背书。
- 若原作者有任何异议，我们会**立即**调整或下架本仓库。联系方式见下。

如果你也在用这个素材库，请先去原站阅读并遵守原作者的使用条款，并考虑给原作者点个赞 / 关注。

---

## 技术参考

在实现「图库选择 + 节点输出」这套交互时，参考了 GitHub 上同类插件中 star 数最高的几个（按 star 排序，2026-10 数据）：

| 排名 | 仓库 | ★ | 借鉴了什么 |
| --- | --- | --- | --- |
| 1 | [netaart/comfyui-browser](https://github.com/netaart/comfyui-browser) | 680 | **后端路由 + 前端面板分离**的架构：用独立 `/files`、`/collections` 这类 aiohttp 路由提供数据，而不是把成百上千条目塞进 widget 下拉框 |
| 2 | [ZHO-ZHO-ZHO/ComfyUI-ArtGallery](https://github.com/ZHO-ZHO-ZHO/ComfyUI-ArtGallery) | 560 | **点缩略图即选、选中即写入节点**的交互范式；`NODE_CLASS_MAPPINGS` 的命名习惯 |
| 3 | [biagiomaf/smart-comfyui-gallery](https://github.com/biagiomaf/smart-comfyui-gallery) | 396 | **本地优先**思路：不依赖云端、直接读本地目录、元数据与图片分离存储 |

另外单独参考了：

- [BigStationW/ComfyUi-ImageGalleryLoader](https://github.com/BigStationW/ComfyUi-ImageGalleryLoader)（50★）—— **hidden widget 回传选择结果**的写法。这是 ComfyUI 里把「前端选的值」安全传给「后端读图逻辑」的标准做法，本插件的 `selected_id` 隐藏字段沿用了它。
- [PanicTitan/ComfyUI-Gallery](https://github.com/PanicTitan/ComfyUI-Gallery)（117★）—— 实时预览与元信息展示的组织方式。

> 说明：以上仅为**架构与交互模式的参考**，本仓库代码为独立实现，未复制上述项目的源码。

---

## 安装

### 1. 拷贝目录

把本仓库整个目录放到：

```
<你的 ComfyUI>/custom_nodes/comfyui_pose_gallery
```

> 目录名用**下划线**（`comfyui_pose_gallery`），别用连字符 —— Python 模块名不允许连字符。
>
> 注意：仓库名是 `comfyui-pose-gallery`（带连字符），**拷进去时请改名成下划线形式**。

### 2. 重启 ComfyUI

节点分类在 **Pose Gallery** 下。

### 3. 下载素材（首次使用必做）

**本仓库不附带任何图片**，首次使用需要下载素材。有三种方式，任选一种：

#### 方式 A：一键下载（推荐）

1. 在画布上放一个「姿态库 · 单张」节点
2. 点节点上的 **「⤓ 下载素材（首次使用）」** 按钮
3. 勾选要下载的内容 → 点「开始下载」
   - 缩略图（约 22 MB）：图库面板预览用
   - 原图 PNG（约 590 MB）：节点真正读的图，**不下载则节点无法输出图片**
   - 首次试水可勾「只下前 20 个姿态」（约 40 MB）
4. 默认保存到 `~/pose-gallery-library`，下载完成后即可直接使用

> 下载器**直接从原作者站点**抓取，落到**你自己这台机器**上。
> 这是「用户个人获取」，不是「插件替你分发」。
> 已下载的文件会自动跳过，中断后重跑可以续传。

#### 方式 B：手动指定已有素材

如果你已经有一份素材库（含 `data/`、`thumbs/`、`img/`），编辑 `config.json`：

```json
{
  "gallery_root": "<你的素材库根目录>"
}
```

也可以留空，让它自动探测：

- 插件目录的 `./`（素材库就在插件目录内）
- 插件目录的 `../`（插件放在素材库目录内的常见情形）
- 一键下载的默认目录

或设置环境变量 `POSE_GALLERY_ROOT`。

> 自动探测**只在插件目录、其上一级、以及下载目录**查找，不会去翻其它目录找别人的素材库。

#### 方式 C：改下载位置

想让素材放到别处（比如大容量盘），在 `config.json` 里加：

```json
{
  "library_dir": "D:/ai/pose-gallery-library"
}
```

或设环境变量 `POSE_GALLERY_LIBRARY`。

---

## 四个节点

| 节点 | 用途 | 输出 batch |
| --- | --- | --- |
| **姿态库 · 单张** | 选 1 张图（可按系统/分类/角度筛选） | 1 |
| **姿态库 · 角度组（5 角度）** | 取同一姿态的多角度 | 5 |
| **姿态库 · 批量** | 按系统/分类/关键词批量取，可跨分类 | N（≤128） |
| **姿态库 · 从批次取单张** | 从批次按序号取一张 | 1 |

---

## 输出口

前三个取图节点输出 5 个值，顺序固定：

| 输出名 | 类型 | 内容 |
| --- | --- | --- |
| `IMAGE` | IMAGE | `[B,H,W,3]`，0~1 归一化，可直接接其它图像节点 |
| `META_JSON` | STRING | JSON。单张=对象，批量=数组，**与 IMAGE 的 batch 严格一一对应** |
| `IMAGE_IDS` | STRING | JSON 数组，图片编号，顺序与 batch 一致 |
| `PATHS` | STRING | JSON 数组，原图绝对路径，顺序与 batch 一致 |
| `NOTE` | STRING | 一行人类可读摘要 |

`META_JSON` 每一项的字段：

```json
{
  "image_id": "full_sexy_P001_front",
  "pose_id": "full_sexy_P001",
  "angle": "正面",
  "name": "S形站姿·胯部向侧顶出",
  "name_ja": "S字立ち・腰を横に突き出す",
  "system": "全身单人·性感系",
  "category": "站立",
  "number": "P001",
  "full_path": "<素材库>/img/full_sexy_P001_front.png"
}
```

**怎么让其它节点读取编号**：把 `IMAGE_IDS` 或 `META_JSON` 接到任何吃 `STRING` 的节点即可。
**要按编号反查图片**：`PATHS` 里就是可直接读的绝对路径。

### 典型用法

| 场景 | 接法 |
| --- | --- |
| 一组 5 角度做多视角参考 | `角度组` → `IMAGE`（5 张）→ 参考图预处理节点 |
| 批量抽一批姿态做风格探索 | `批量`（limit=8）→ 8 张批次 |
| 只取其中一张继续跑 | `批量` → `从批次取单张`（index=2）→ 单张 + 编号/名称/路径 |

---

## 图库选择面板

节点上有三个按钮：

- **① 打开图库选择** —— 弹出可视化面板：系统/分类/角度筛选、关键词搜索、点图即选
  - 单张 / 角度组节点：**单选**
  - 批量节点：**可多选**
- **② 清空选择**
- **③ 展示线稿图** —— 把已选姿态的线稿图直接渲染在节点上

面板通过后端路由取数据（不把全库塞进下拉框）：`/pose_gallery/config`、`/poses`、`/pose/{id}`、`/stats`、`/thumb`、`/full`。

> 面板不可用时（路由注册失败）节点仍可正常工作，只是改用下拉框筛选。

### 缩略图比例与尺寸（3:4）

姿态图原始比例是 **3:4**，面板缩略图严格按此比例渲染，不会拉伸变形：

| 档位 | 图片实际尺寸 |
| --- | --- |
| 90 px | 90 × 120 |
| **120 px（默认）** | 120 × 160 |
| 150 px | 150 × 200 |

- 筛选栏右侧 `90 / 120 / 150` 三个按钮即时切换，**选择会被记住**
- 小档位适合快速扫览，大档位适合看清细节

### 面板可自由缩放

面板右下角有拖拽手柄，可**拉宽、拉高**，一次看到更多线稿：

- 拖拽即时生效，最小 520×320，最大不超过视口 98%
- **尺寸自动记忆**（`localStorage` 的 `pose-gallery-panel-size`），下次打开沿用
- 恢复默认：清掉该 localStorage 键即可

### 节点内联线稿预览

选完姿态后，线稿图**直接显示在节点上**，不必再打开面板确认：

- 单选节点显示 1 张；批量节点最多 4 张，超出用 `+N` 标注
- 图片同样严格 3:4，左下角标注 `pose_id`
- 也可随时点 **③ 展示线稿图** 重新渲染
- 预览宽度跟随节点宽度自适应，4 张时自动排两行

### 界面语言（中文 / 日本語 / English）

面板右上角有语言切换按钮，**默认中文**：

| 语言 | 界面文案 |
| --- | --- |
| **中文**（默认） | 全部中文 |
| **日本語** | 全部日文 |
| **English** | 全部英文 |

- 切换即时生效，**不需要重开面板**：面板内的筛选栏、按钮、计数、空状态文案会就地刷新，已加载的列表与选中状态**保留**
- 选择会记住（存 `localStorage` 的 `pose-gallery-lang`），刷新页面 / 重开面板后保持
- 语言切换同时影响**画布上的节点按钮**（「打开图库选择」「下载素材」等）
- 只翻译**界面文案**；素材本身的名字按数据原样显示（中文名 / 日文原名都在索引里）

> 想加别的语言：在 `web/pose_gallery_i18n.js` 的 `DICT` 里加一份词表、把语言码加进 `LANGS` 即可。

---

## 下拉筛选（不用面板时）

三个取图节点都有 `system` / `category` / `angle` 下拉框，默认 `(任意)`：

- **单张**：按筛选取第一个匹配姿态的那张图
- **角度组**：按筛选取第一个匹配姿态，再展开它的各角度
- **批量**：按筛选取前 `limit` 个姿态

需要精确指定时，填 `pose_id`（如 `full_sexy_P001`）或 `pose_ids`（批量节点，逗号/换行分隔）。

**注意**：填了不存在的 id 会明确报错，不会静默返回别的图。

---

## 数据格式

插件读取 `<gallery_root>/data/pose-index.json`：

```json
{
  "meta": {
    "title": "...",
    "total_images": 1439,
    "total_poses": 288,
    "systems": ["..."],
    "categories": ["..."],
    "angles": ["正面", "上方", "下方", "侧面", "斜侧"]
  },
  "poses": [
    {
      "pose_id": "full_sexy_P001",
      "system": "...",
      "system_ja": "...",
      "number": "P001",
      "category": "...",
      "category_ja": "...",
      "name": "...",
      "name_ja": "...",
      "angles": {
        "正面": {
          "id": "full_sexy_P001_front",
          "thumb": "thumbs/full_sexy_P001_front.jpg",
          "full": "img/full_sexy_P001_front.png",
          "angle_ja": "正面"
        }
      }
    }
  ]
}
```

目录约定：

```
<gallery_root>/
├── data/pose-index.json     索引
├── thumbs/                  缩略图（面板用）
└── img/                     原寸图（节点读这个）
```

只要符合上述结构的**任何**姿态库都可以用本插件 —— 不限于某一个素材站。
你可以自己制作素材、或使用其它有授权的素材库。

---

## 已知边界

- **图片尺寸不一致时**：按「最大宽高 + 居中补白」对齐成同尺寸批次，不报错。
  若下游要求严格同尺寸，建议按 `angle` 固定筛选（同角度尺寸一致）。
- **批次别开太大**：`limit` 上限 128；5 角度 × 128 姿态会占较多显存。
- **Windows 路径**：`config.json` 里既可用正斜杠 `/`，也可用双反斜杠 `\\`。
- **⚠️ 未经真实环境测试**：见 [测试状态](#-测试状态未验证--test-status-unverified)，
  出现任何异常请先备份工作流、再把插件目录移走。

---

## 授权状态

| 对象 | 状态 |
| --- | --- |
| 本插件**代码** | 由本仓库作者原创，以 MIT 许可发布 |
| 姿态素材**数据** | 著作权归原作者 ギア 所有，**不在本仓库内**，需自行向原作者获取并遵守其条款 |
| 与原作者的关系 | **非官方**工具。原作者已公开声明「再分发/销售 NG，其它活用全部 OK」，本项目方式在其授权范围内；个别确认见 [docs/PERMISSION-REQUEST.md](docs/PERMISSION-REQUEST.md) 与 [docs/PERMISSION-STATUS.md](docs/PERMISSION-STATUS.md) |

如原作者要求，本仓库会立即调整或下架。

---

## 许可证

- **代码**：[MIT](LICENSE)
- **素材数据**：不属于本仓库，版权归原作者，遵循原作者的使用条款

---

## 联系

- Issue：<https://github.com/lnyuqian/comfyui-pose-gallery/issues>
- 原作者：<https://x.com/giaaibusi>

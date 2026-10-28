# ComfyUI Pose Gallery

把**本地姿态素材库**接进 ComfyUI：按「单张 / 一组 5 角度 / 批量（跨分类）」取图，输出图片与编号元信息，供其它节点读取。

> ⚠️ **本仓库不包含任何图片或姿态数据。** 只包含读取工具（代码）。
> 数据需由使用者自行从原始站点获取，并遵守原作者的使用条款 —— 详见 [ATTRIBUTION.md](ATTRIBUTION.md)。

---

## 目录

- [这是什么](#这是什么)
- [数据来源与致谢](#数据来源与致谢)
- [技术参考](#技术参考)
- [安装](#安装)
- [四个节点](#四个节点)
- [输出口](#输出口)
- [图库选择面板](#图库选择面板)
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

### 2. 配置数据路径

编辑 `config.json`，把 `gallery_root` 改成你的素材库目录**绝对路径**
（即含 `data/`、`thumbs/`、`img/` 的那一层）：

```json
{
  "gallery_root": "<你的素材库根目录>"
}
```

也可以留空，让它自动探测以下位置：

- 插件目录的 `./`（素材库就在插件目录内）
- 插件目录的 `../`（插件放在素材库目录内的常见情形）

或设置环境变量 `POSE_GALLERY_ROOT`。

> 自动探测**只在插件目录及其上一级**查找，不会去翻其它目录找别人的素材库。

### 3. 重启 ComfyUI

节点分类在 **Pose Gallery** 下。

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

节点上有两个按钮：

- **① 打开图库选择** —— 弹出可视化面板：系统/分类/角度筛选、关键词搜索、点图即选
  - 单张 / 角度组节点：**单选**
  - 批量节点：**可多选**
- **② 清空选择**

面板通过后端路由取数据（不把全库塞进下拉框）：`/pose_gallery/config`、`/poses`、`/pose/{id}`、`/stats`、`/thumb`、`/full`。

> 面板不可用时（路由注册失败）节点仍可正常工作，只是改用下拉框筛选。

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

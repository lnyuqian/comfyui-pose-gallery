# 工作流说明 / Workflows

**最后更新：2026-10-29**

本目录提供两个可直接加载的 ComfyUI 工作流，基于 **Qwen-Image-2.1** 的图生图（编辑）能力，
把姿态素材库的线稿作为参考图接进生成流程。

> 依赖：Qwen-Image-2.1 的 diffusion model / text encoder / VAE，
> 以及 8 步加速 LoRA。模型需自行准备，本仓库不附带任何模型或素材数据。

---

## 该选哪个

| 场景 | 用这个 |
| --- | --- |
| 试参数、调提示词、只要 1 张 | [`pose-to-qwen-single.json`](#pose-to-qwen-singlejson) |
| 一次出多张不同姿态 | [`pose-to-qwen-batch.json`](#pose-to-qwen-batchjson) |

---

## pose-to-qwen-single.json

**单张出图。** 在节点面板里选 1 个姿态，生成 1 张图。

### 结构（10 节点）

```text
PoseGalleryLoader ──IMAGE──┐
                           ├──> TextEncodeQwenImage21 ──> KSampler ──> VAEDecode ──> SaveImage
CLIPLoader ─────────────────┤            (positive / negative / latent)
VAELoader ──────────────────┘
UNETLoader ──> LoraLoaderModelOnly ──> QwenImage21Cache ──> (KSampler.model)
```

### 实测参数

| 项 | 值 |
| --- | --- |
| `resolution` | 1024 |
| `steps` | 8 |
| `cfg` | 1.0 |
| `sampler` / `scheduler` | `euler` / `simple` |
| 耗时 | 约 12–26 秒 / 张（RTX 2080 Ti 22GB） |

### 用法

1. 加载 `pose-to-qwen-single.json`
2. 在「姿态库 · 单张」节点上点 **① 打开图库选择**，挑一个姿态
3. 节点上会直接显示这张线稿，确认无误
4. 改提示词 → 队列生成

---

## pose-to-qwen-batch.json

**批量出图，逐张独立参考。** 在**一个**面板里选 N 张线稿，一次生成 N 张，
每张各自跟随自己那张线稿的姿态。

### 结构（24 节点 / 3 条分支）

```text
                        ┌─> ImageFromBatch(0) ─┐
                        │                      ├─> TextEncodeQwenImage21 ─> KSampler ─> VAEDecode ─┐
PoseGalleryBatchLoader ─┼─> ImageFromBatch(1) ─┤        ↑                                              │
   （一次取多张）        │                      │   PoseGalleryPosePrompt(1)                         ├─> ImageBatch ─> SaveImage
                        └─> ImageFromBatch(2) ─┘        （该姿态名称拼进提示词）                      │
                                                    ...（分支 0 / 2 同构）───────────────────────────┘
```

每条分支的固定搭配：

```text
ImageFromBatch(i)  ──IMAGE──>  TextEncodeQwenImage21.images.image_1
PoseGalleryPosePrompt(i) ──STRING──> TextEncodeQwenImage21.prompt
                              KSampler seed = 5000 + i
```

### 为什么必须「逐张独立参考」

这是本工作流存在的原因，也是一个很容易踩的坑。

`TextEncodeQwenImage21`（`comfy_extras/nodes_qwen.py`）的实现是：

```python
samples = image[:1]        # 只取传入批次的第一张
...
latent = torch.zeros([1, 64, latent_h // 16, latent_w // 16], ...)   # 只输出一份 latent
```

所以下面这种看起来「很自然」的接法是**错的**：

```text
PoseGalleryBatchLoader(3张) ──> TextEncodeQwenImage21 ──> RepeatLatentBatch(3) ──> KSampler
```

3 张线稿喂进去，只有第 1 张被真正读取；`RepeatLatentBatch` 复制的是同一份条件，
产出只是同一个人物的不同噪声变体。**症状是「只有第一张姿态对，后面两张完全不对」，
而且换几次结果都一样——这是必然，不是随机性。**

正确做法就是本工作流的接法：每条分支各自 `ImageFromBatch` 切一张、各自编码、各自采样。

### 为什么还要加「姿态描述提示词」

线稿只有人体结构，没有五官、服装、场景语义。模型容易按训练分布自由发挥——
例如把「站立单腿抬至肩间握脚踝」画成「举手摸头发」，把「跪立」画成「趴着」。

`PoseGalleryPosePrompt`（本插件新增节点）从批次的 `META_JSON` 里取出第 N 个姿态，
用库里的中文名称拼出一段描述文本，接进 `TextEncodeQwenImage21.prompt`。
实测对难姿态提升明显。

节点参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `meta_json` | —（连线） | 接 `PoseGalleryBatchLoader` 的 `META_JSON` 输出 |
| `index` | 0 | 取第几个姿态，从 0 起算，**必须与该分支的 `batch_index` 一致** |
| `prefix` | `画面里的人物姿态：` | 拼在描述前面的文本 |
| `suffix` | 空 | 拼在后面的文本 |
| `include_category` | true | 是否叠加分类提示；名称里已写明体位时自动跳过，避免「跪立」被分类「四肢着地」带偏 |

> **提示词怎么给**
>
> 本工作流把整段风格描述放在 `PoseGalleryPosePrompt` 的 `prefix` 里，
> `TextEncodeQwenImage21` 的 `prompt` 留空、由连线喂入。
> 若你更习惯直接在编码节点里写提示词，把 `prefix` 改短（如 `画面里的人物姿态：`），
> 再把风格描述写回编码节点的 `prompt` 即可——但**不能两处都留空**。

### 想改张数怎么办

仓库这份固定为 **3 条分支**。要出别的张数：

1. 复制一条完整分支（`ImageFromBatch` + `PoseGalleryPosePrompt` + `TextEncodeQwenImage21` + `KSampler` + `VAEDecode`）
2. 把新分支 `ImageFromBatch` 的 `batch_index` 改成目标位置（从 0 起算）
3. 把新分支 `PoseGalleryPosePrompt` 的 `index` 改成同一个数字
4. 把新 `VAEDecode` 的输出接进 `ImageBatch` 链
5. 把 `PoseGalleryBatchLoader` 的 `limit` 设成新的张数

> 两处序号必须一致，否则姿态描述会和图片对错人。

### 实测参数

| 项 | 值 |
| --- | --- |
| `resolution` | 1024 |
| `steps` | 8 |
| `cfg` | 1.0 |
| `sampler` / `scheduler` | `euler` / `simple` |
| 分支 seed | 5000 / 5001 / 5002（各自独立） |
| 耗时 | 约 58–78 秒 / 3 张（RTX 2080 Ti 22GB） |

### 用法

1. 加载 `pose-to-qwen-batch.json`
2. 在「姿态库 · 批量」节点上点 **① 打开图库选择**，一次勾选多张（勾几张就出几张，最多 3 张不用改图）
3. 节点上会显示所选线稿缩略图
4. 队列生成

---

## 两个工作流共同的注意点

- **`cfg = 1.0` 时负面提示词不生效。** 这是 Qwen-Image-2.1 加速 LoRA 的推荐设置，
  但意味着 `negative_prompt` 里的内容（低质量、多手多脚、线稿……）实际上不起作用。
  如果你要压制某些内容，需要调高 `cfg`，此时也应相应降低步数或调整采样器。
- **姿态图是线稿人体模型，DWPose / OpenPose 等骨骼检测节点识别不了。**
  它们依赖真实人体特征（肤色、关节纹理），线稿里没有。
  需要骨骼级控制时，走「线稿 → 视觉模型转文字 → 合并提示词」路线，
  或改用真人骨架参考图。
- **参考图分辨率**：`resolution = 1024` 会把参考图缩放到约 1024×1024 范围内（保持比例）。
  设为 0 则保留各张原始尺寸（对齐到 32 的倍数）。
  多张参考图尺寸不一致时，latent 尺寸取自**第一张**。

---

## 更新记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-29 | 批量工作流改为逐张独立参考（`ImageFromBatch`），新增 `PoseGalleryPosePrompt` 姿态描述节点；修复「只有第一张姿态对」的问题 |
| 2026-10-28 | 两个工作流首次加入仓库并实测通过 |

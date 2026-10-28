# 许可申请状态 / Permission Status

| 项目 | 内容 |
| --- | --- |
| 文件编号 / Doc ID | PG-LIC-2026-001 |
| 申请日期 / Requested on | 2026-10-28 |
| 被申请人 / Requested to | ギア（[X @giaaibusi](https://x.com/giaaibusi)） |
| 申请文件 / Document | [PERMISSION-REQUEST.md](PERMISSION-REQUEST.md) |
| **当前状态 / Current status** | 🟢 **原作者已于 X 公开声明「再分发/销售 NG，其它活用全部 OK」** → 本项目的「引用 + 不附带素材」方式在该授权范围内。个别确认仍待回覆 |

---

## ✅ 原作者的公开授权声明 / Author's Public Statement

**2026-10-28 抓取自作者本人 X 主页：**

> 海外勢はうまく利用してバズってるね
> ・引用で紹介して77万インプ
> ・データベースを紹介して14万インプ
> ・ポーズを活用して7.5万インプ
>
> 日本人もうまく私を利用して
> SNSを伸ばして下さい
>
> **画像データ自体の再配布、販売はNGですが**
> **それ以外の活用方法は全部OKです**

- 推文链接 / Tweet URL：<https://x.com/giaaibusi/status/2115302275686207681>
- 日期 / Date：2026-10-28（约 3 小时前发布）

**中文译文：**

> 海外的人很会用、也火起来了
> ・引用介绍 → 77 万曝光
> ・介绍数据库 → 14 万曝光
> ・活用姿态 → 7.5 万曝光
>
> 日本人也请好好利用我
> 把 SNS 做起来
>
> **图像数据本身的再分发、销售是 NG，**
> **除此之外的活用方法全部 OK。**

**对本项目的意义：**

| 项目做法 | 是否符合该声明 |
| --- | --- |
| 仓库内不含任何图像数据 | ✅ 完全没有再分发 |
| 不销售任何素材 | ✅ |
| 在文档中介绍该素材库并链接作者 | ✅ 属于「介绍数据库」的活用 |
| 用户自行从原站获取素材 | ✅ |
| 把素材接入 ComfyUI 工作流 | ✅ 属于「其余的活用方法」 |

> 结论：本仓库的现有形态（**只发布代码、不分发素材、署名并链接作者**）
> 落在原作者公开声明的授权范围内。
> 我们仍会向作者本人发一次个别确认，以获得更明确的背书。

---

## 状态时间线 / Timeline

| 日期 | 事件 |
| --- | --- |
| 2026-10-28 | 起草申请文件（中日文对照） |
| 2026-10-28 | 项目以「非官方工具」形式发布，仓库内**不含任何素材文件** |
| 2026-10-28 | **确认作者公开声明：再分发/销售 NG，其它活用全部 OK**（见上节） |
| 2026-10-28 | 在仓库创建许可申请 Issue：[#1](https://github.com/lnyuqian/comfyui-pose-gallery/issues/1) |
| — | 待：通过 X 私信递交个别确认（需先登录 X 账号） |
| — | 待：原作者回覆后更新本文件 |

---

## 本项目当前的自我约束 / Current self-restraints

在获得明确许可前，本仓库已自行采取以下限制：

1. **不包含任何素材文件**（无 `.png` / `.jpg`、无素材索引 JSON）
2. **不提供指向特定素材库的预设配置**（`config.json` 的 `gallery_root` 为空）
3. **文档中明确说明数据需使用者自行准备**
4. README 顶部标注「数据来源与技术参考」并链接原作者

Before receiving explicit permission, this repository applies the following self-restraints:

1. **Contains no asset files** (no `.png` / `.jpg`, no asset index JSON)
2. **Ships no preset pointing to a specific asset library** (`gallery_root` in `config.json` is empty)
3. **Docs clearly state that users must prepare the data themselves**
4. README links to the original author and states the data source

---

## 若收到回覆 / If a reply is received

- **同意 / Approved** → 更新本文件为 🟢 已获许可，附上回覆截图（经对方同意），
  README 状态改为「Unofficial tool, used with permission」
- **附条件同意 / Conditional** → 逐条落实对方条件，并在本文档列出对应措施
- **不同意 / Declined** → 移除所有指向该素材库的文档内容，仅保留通用工具功能；
  如对方要求，直接下架本仓库

---

## 若 30 日内无回覆 / If no reply within 30 days

按申请文件所述，视为「未获许可」，届时：

- 保留插件的**通用工具**功能（可读取任何符合格式的姿态库）
- 文档中不再出现对特定素材库的适配说明与示例
- 本文档状态改为 🟠 未获回覆，并说明后续处理方式

# 署名与许可证

本项目的原创内容采用 MIT 许可证，见 [LICENSE](LICENSE)。下列第三方内容不在其范围内，仍按各自的许可证使用。

## 改编的内容

- **3D 解剖视图的神经与动脉走行、椎骨、斜角肌网格，以及两个视图共用的背阔肌网格**（`assets/plexus/`）
  来自 [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy)（`Startup.blend`，2023-05-02 版）。
  署名：Z-Anatomy – The libre 3D atlas of anatomy；BodyParts3D – The Database Center for Life Science。
  许可证 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)：这一目录按同样的许可证发布，不适用本项目的 MIT 许可证。
  改动：
  - 取中心线，配准到 BodyParts3D 骨骼，按本页节点拆分。
  - 补画 Z-Anatomy 缺失或接错的段落：外侧束、内侧束、下干后股、正中神经内外侧根、肌皮神经与腋神经起始段等。
  - 把尺神经和臂、前臂内侧皮神经的上臂近段移到肱动脉内侧。

  完整清单见 `assets/plexus/LICENSE.md`，生成脚本见 `tools/zanatomy/`。
- **3D 解剖视图的备用示意模型**（`js/data/anatomy3d.js`，只在上面的真实走行加载失败时使用）
  改编自 [prathusa/anatomy](https://github.com/prathusa/anatomy) 的 `js/regions/upper-limb.js`，
  作者 "Anatomy contributors"，许可证 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
  改动：只取上肢部分；把神经走行按本页的节点拆分；新增 6 个股、臂/前臂内侧皮神经、颈胸椎椎体与第 1 肋的示意坐标；
  把肌肉归并到本页的运动靶区；结构名称译为中文。
- **右上肢「肌肉」页与 3D 解剖视图的骨骼、肌肉网格**（`assets/limb/meshes.bin`、`meshes.json`）
  来自 [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) 4.0（`isa_BP3D_4.0_obj_99`）。
  署名：BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International。
  许可证 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，以官方[许可页](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)（2025-02-27 更新）为准；
  原始 OBJ 文件头的注释仍写着旧的 CC BY-SA 2.1 Japan，那是更新前的说法。
  改动：只取右上肢的肌肉、骨骼和第 1–9 肋；焊接重复顶点；把合并的蚓状肌拆成 4 条；
  按本页的运动靶区归并部件；坐标换成 Y 向上、单位 cm，并量化为 16 位整数。生成脚本见 `tools/build-limb-meshes.mjs`。
  BodyParts3D 4.0 没有背阔肌：「肌肉」页和 3D 解剖视图都用 Z-Anatomy 的背阔肌（见上一条）。
- **部分病例定位题**（`js/data/quiz.js` 的 `CASES`）
  改编自 [rjg/brachialplexus](https://github.com/rjg/brachialplexus) 的 `Brachial Plexus Data.txt`，MIT 许可证。
  改动：译为中文、改写题干，修正了原第 9 例（把屈肘无力归于后束），并补充了多例。

## 借鉴思路（未复制内容）

- [kai9987kai/Arm-Nerve-Simulation](https://github.com/kai9987kai/Arm-Nerve-Simulation)（Apache-2.0）：按症状/体征搜索、每条神经的查体与口诀卡片。
- prathusa/anatomy 的损伤判定规则（切断点只带走它实际携带的节段）与「由数据生成选择题」的做法（代码 MIT）。

## 第三方库

- [three.js](https://threejs.org/) r160（`vendor/three.module.min.js`、`vendor/OrbitControls.js`），MIT 许可证，见 `vendor/LICENSE-three.txt`。

## 免责声明

仅供解剖学习，不用于临床诊断。节段按常用教材取值，教材之间、个体之间常相差约一个节段；3D 解剖视图的神经走行来自 Z-Anatomy 图谱模型，其中束段等少数段落是按解剖关系补画的，并非扫描数据；骨骼、肌肉网格来自 BodyParts3D 的成年男性参考模型，个体之间会有差异。

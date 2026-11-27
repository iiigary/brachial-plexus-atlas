# assets/plexus 的许可证

本目录的文件**不在**项目 MIT 许可证的范围内，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 发布。

| 文件 | 内容 |
|---|---|
| `plexus3d.json` | 「3D 解剖」视图的臂丛与上肢神经走行、动脉中心线、预设视角、结构标签 |
| `meshes.json`、`meshes.bin` | 颈椎 C3–T2、胸骨柄、右背阔肌、右前/中斜角肌网格（右上肢「肌肉」页也用其中的背阔肌） |

## 署名

- **Z-Anatomy – The libre 3D atlas of anatomy**，CC BY-SA 4.0，<https://github.com/Z-Anatomy/Models-of-human-anatomy>
- **BodyParts3D – The Database Center for Life Science**，CC BY 4.0，<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>（Z-Anatomy 的几何派生自 BodyParts3D）

## 改动

生成脚本见 `tools/zanatomy/`。相对 Z-Anatomy 的 `Startup.blend`（2023-05-02 版）：

1. 只取右侧臂丛、上肢神经、相关动脉，以及上表所列网格；神经、动脉取曲线的中心线，不取倒角后的网格。
2. 坐标做相似变换（缩放 0.967，加旋转和平移），对齐到 `assets/limb` 的 BodyParts3D 骨骼。肩带骨表面的平均残差为 2.5–3.3 mm。单位为 cm。
3. 按本页的节点（根、干、股、束、终末支、侧支）拆分走行，C5–T1 的根按样条分开。
4. 补画了 Z-Anatomy 缺失或接错的段落：
   - 外侧束、内侧束；
   - 下干后股（原来接在前股的汇合点上）；
   - 后束向远端延长到腋动脉第 2 段后方（并入了桡神经起始的 1.3 cm）；
   - 正中神经的内、外侧根（原来从后束发出）；
   - 肌皮神经起始段（原来悬空）；
   - 腋神经起始段（原来从前股汇合点发出）；
   - 尺神经起始段；
   - 胸内侧神经、臂内侧皮神经、前臂内侧皮神经的起始段；
   - 胸长神经的 C7 支。
5. 尺神经、臂内侧皮神经、前臂内侧皮神经的上臂近段，平滑地移到了肱动脉内侧。原数据把它们放在动脉外侧，与教材不符。
6. 神经与锁骨下、腋、肱、桡、尺动脉中心线之间保持最小间距，消除了原数据里贴进动脉的部分。
7. 网格量化为 16 位整数。

补画的段落是按解剖关系示意的，不是扫描数据。

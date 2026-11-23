# 署名与许可证

## 改编的内容

- **3D 骨骼、动脉、神经走行与肌肉纤维坐标**（`js/data/anatomy3d.js`）
  改编自 [prathusa/anatomy](https://github.com/prathusa/anatomy) 的 `js/regions/upper-limb.js`，
  作者 "Anatomy contributors"，许可证 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
  改动：只取上肢部分；把神经走行按本页的节点拆分；新增 6 个股、臂/前臂内侧皮神经、颈胸椎椎体与第 1 肋的示意坐标；
  把肌肉归并到本页的运动靶区；结构名称译为中文。
- **部分病例定位题**（`js/data/quiz.js` 的 `CASES`）
  改编自 [rjg/brachialplexus](https://github.com/rjg/brachialplexus) 的 `Brachial Plexus Data.txt`，MIT 许可证。
  改动：译为中文、改写题干，修正了原第 9 例（把屈肘无力归于后束），并补充了多例。

## 借鉴思路（未复制内容）

- [kai9987kai/Arm-Nerve-Simulation](https://github.com/kai9987kai/Arm-Nerve-Simulation)（Apache-2.0）：按症状/体征搜索、每条神经的查体与口诀卡片。
- prathusa/anatomy 的损伤判定规则（切断点只带走它实际携带的节段）与「由数据生成选择题」的做法（代码 MIT）。

## 第三方库

- [three.js](https://threejs.org/) r160（`vendor/three.module.min.js`、`vendor/OrbitControls.js`），MIT 许可证，见 `vendor/LICENSE-three.txt`。

## 免责声明

仅供解剖学习，不用于临床诊断。节段按常用教材取值，教材之间、个体之间常相差约一个节段；3D 为示意模型，不是扫描数据。

# 臂丛神经联动可视化 · Brachial Plexus Atlas

交互式臂丛神经学习工具：从 C5–T1 神经根到上肢肌肉和皮区，点选任意结构即可双向溯源，并模拟各平面损伤的表现。

## 功能

- **2D 通路图**：根 → 干 → 股 → 束 → 终末支，以及主要旁支和前臂分支（骨间前/后神经、桡神经浅支）。只沿真实纤维路径高亮，例如腋神经只亮 C5–C6 → 上干 → 上干后股 → 后束。
- **上肢联动图**：支配肌肉、周围皮区、C5–T1 皮节三种模式；点肌肉或皮区可反向溯源到神经。
- **损伤模拟**：Erb、Klumpke、桡神经、正中神经、尺神经、腋神经、胸长神经，含不同损伤平面（如桡神经沟 / 骨间后神经、腕管 / 骨间前神经）。
- **自由切断**：切断任意一处或多处结构，实时推算完全/部分瘫痪的肌肉、感觉缺失和 Horner 征。
- **3D 解剖示意**：three.js 渲染的骨骼、动脉、神经走行与肌肉，可旋转缩放、点选联动。
- **搜索**：神经、肌肉、损伤和体征（如“垂腕”“Froment”“OK 征”“ULTRA”）。
- **自测**：结构定位题、反向题、病例定位题、按模型自动生成的选择题，以及错题本（保存在本机浏览器）。
- 查体卡片、投影模式、打印版式、深色主题；页面状态记在网址里，可直接分享链接。

## 运行

页面使用 ES 模块，需要通过本地服务器打开（不能直接双击 HTML）：

```bash
python3 serve.py
```

然后访问 <http://localhost:8765>。macOS 上也可以直接双击 `start.command`。无需安装任何依赖，可离线使用。

## 测试

```bash
node tests/check-model.mjs
```

校验纤维路由模型、各损伤平面的受累范围、病例题与模型的一致性、自动生成的选择题，以及页面数据与模型是否对应。

## 目录

```
index.html            页面结构
css/                  样式
js/model.js           纤维路由模型（节段、溯源、损伤推导的唯一数据源）
js/data/              节点、上肢图分区、损伤说明、题库、临床卡片、3D 坐标
js/app.js             交互核心；plexus2d.js / limb.js / view3d.js 为三个视图
vendor/               three.js r160
legacy/               旧版单文件页面
```

## 署名

3D 骨骼、动脉、神经走行与肌肉纤维坐标改编自 [prathusa/anatomy](https://github.com/prathusa/anatomy)（Anatomy contributors，CC BY 4.0）；部分病例改编自 [rjg/brachialplexus](https://github.com/rjg/brachialplexus)（MIT）。详见 [CREDITS.md](CREDITS.md)。

仅供解剖学习，不用于临床诊断。节段按常用教材取值，教材间可相差约一个节段。

# 由 Z-Anatomy 生成 3D 解剖视图的数据

输出是 `assets/plexus/`，按 CC BY-SA 4.0 发布，见该目录的 `LICENSE.md`。已生成的文件随仓库提供，只有更新数据时才需要重跑。

## 准备

- Blender 4 及以上。macOS 上用 `brew install --cask blender` 安装。
- Z-Anatomy 的 `Startup.blend`：

```bash
mkdir -p raw/z-anatomy && curl -fL -o raw/z-anatomy/Z-Anatomy.zip https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip
```

```bash
unzip -q raw/z-anatomy/Z-Anatomy.zip -d raw/z-anatomy/src
```

- `assets/limb/` 已生成（BodyParts3D 骨骼，用作配准目标）。

`raw/` 已被 git 忽略。Blender 一律用 `--disable-autoexec` 运行，不执行 `.blend` 里内嵌的脚本，也不安装压缩包里的插件。

## 步骤

1. 导出神经、动脉中心线和相关网格，写出 `raw/z-anatomy/curves.json` 与 `bones.json`：

```bash
blender -b --disable-autoexec raw/z-anatomy/src/Z-Anatomy/Startup.blend --python tools/zanatomy/curves.py -- raw/z-anatomy
```

2. 把 Z-Anatomy 骨骼配准到 BodyParts3D 骨骼，写出 `raw/z-anatomy/align.json`，并打印每块骨的残差：

```bash
node tools/zanatomy/align.mjs raw/z-anatomy/bones.json raw/z-anatomy/align.json
```

3. 按本页的节点拆分走行、补画缺失段落，写出 `assets/plexus/`：

```bash
npm run build:plexus
```

4. 校验：

```bash
npm test
```

`inspect.py` 不在主流程里。Z-Anatomy 更新、对象改名时，用它列出相关对象的名称和三角形数：

```bash
blender -b --disable-autoexec raw/z-anatomy/src/Z-Anatomy/Startup.blend --python tools/zanatomy/inspect.py -- raw/z-anatomy/inspect.json
```

## 补画与调整

Z-Anatomy 的臂丛在锁骨下段很粗糙，有以下几类问题：

- 外侧束、内侧束长度为零；
- 腋神经、下干后股、正中神经接错了位置；
- 肌皮神经起点悬空；
- 尺神经在上臂近段落在肱动脉外侧。

`build-plexus3d.mjs` 用腋动脉作参照，按「各束以腋动脉第 2 段命名」重建了这一段，具体见脚本注释。补画和调整过的结构列在 `plexus3d.json` 的 `drawn` 与 `adjusted` 里，界面上鼠标悬停时会说明。

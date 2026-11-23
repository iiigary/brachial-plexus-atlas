#!/bin/bash
# 生成可直接复制到 U 盘的离线文件夹「臂丛神经图谱-U盘版」（只含运行所需文件，约 4 MB）。
# 用法：bash tools/make-usb.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="臂丛神经图谱-U盘版"

rm -rf "$OUT"
mkdir "$OUT"
cp -R index.html css js vendor assets CREDITS.md serve.ps1 serve.py start.command "$OUT/"
# .bat 必须是 CRLF 换行，否则 Windows 的 cmd 可能解析出错
perl -pe 's/\r?\n/\r\n/' start.bat > "$OUT/start.bat"
cat > "$OUT/使用说明.txt" <<'EOF'
臂丛神经图谱 · 离线版

Windows：双击 start.bat，浏览器会自动打开。上课期间不要关掉弹出的黑色窗口。
Mac：双击 start.command（需要已安装 Python 3）。

不要直接双击 index.html，那样页面打不开。
在线版：https://iiigary.github.io/brachial-plexus-atlas/
EOF
perl -pi -e 's/\r?\n/\r\n/' "$OUT/使用说明.txt"
find "$OUT" -name .DS_Store -delete
du -sh "$OUT"

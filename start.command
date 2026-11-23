#!/bin/bash
# 双击运行：在本目录启动本地服务器并用浏览器打开（ES 模块不能直接用 file:// 打开）。
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open "http://localhost:$PORT/index.html" ) &

python3 serve.py "$PORT"

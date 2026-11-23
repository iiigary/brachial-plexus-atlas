"""本地预览服务器：和 python3 -m http.server 一样，但让浏览器每次都重新验证文件，改完刷新就能看到。
用法：python3 serve.py [端口，默认 8765]"""
import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).resolve().parent))
print(f'臂丛神经可视化：http://localhost:{port}/index.html （Ctrl+C 停止）')
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()

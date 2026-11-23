# Local static server for Windows (no install needed). Started by start.bat.
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 without BOM.
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.bin'  = 'application/octet-stream'
}

$listener = $null
foreach ($port in 8765..8785) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$port/")
  try { $l.Start(); $listener = $l; break } catch { $l.Close() }
}
if (-not $listener) {
  Write-Host 'Could not start a local server (ports 8765-8785 are all busy).'
  Read-Host 'Press Enter to exit'
  exit 1
}

$url = "http://localhost:$port/index.html"
Write-Host "Brachial Plexus Atlas is running at $url"
Write-Host 'Keep this window open during class. Close it to stop.'
Start-Process $url

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    $inside = $path.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar)
    if ($inside -and [System.IO.File]::Exists($path)) {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $type = $types[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $res.ContentType = $type
      $res.AddHeader('Cache-Control', 'no-cache')
      $res.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne 'HEAD') {
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } else {
      $res.StatusCode = 404
    }
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.Close() } catch {}
  }
}

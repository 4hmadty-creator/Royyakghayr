# Simple local web server for Royyak Optics frame sequence
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " ROYYAK OPTICS - Scroll Frame Sequence Server" -ForegroundColor Yellow
Write-Host " Server running at: http://localhost:$port/" -ForegroundColor Green
Write-Host " Press Ctrl+C in this terminal to stop the server" -ForegroundColor Gray
Write-Host "=================================================" -ForegroundColor Cyan

# Open default browser automatically
Start-Process "http://localhost:$port/"

$mimeTypes = @{
    ".html" = "text/html";
    ".css"  = "text/css";
    ".js"   = "application/javascript";
    ".jpg"  = "image/jpeg";
    ".jpeg" = "image/jpeg";
    ".png"  = "image/png";
    ".svg"  = "image/svg+xml";
    ".json" = "application/json"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($path)) {
            $path = "index.html"
        }

        $localPath = Join-Path (Get-Location) $path

        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }

        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}

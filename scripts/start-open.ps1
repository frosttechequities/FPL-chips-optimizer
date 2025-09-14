param(
  [int]$Port = [int]($env:PORT) -as [int]
)

if (-not $Port) { $Port = 5000 }

Write-Host "Starting production server on port $Port..."

# Ensure build exists
if (-not (Test-Path -Path "dist/index.js")) {
  Write-Host "Build not found. Building..."
  npm run build | Out-Host
}

$env:NODE_ENV = 'production'
if ($env:PORT -eq $null) { $env:PORT = "$Port" }

# Launch server in background
$logsDir = Join-Path -Path "." -ChildPath "logs"
if (-not (Test-Path $logsDir)) { New-Item -Path $logsDir -ItemType Directory | Out-Null }
$logOut = Join-Path $logsDir "server.out.log"
$logErr = Join-Path $logsDir "server.err.log"
if (Test-Path $logOut) { Remove-Item $logOut -Force }
if (Test-Path $logErr) { Remove-Item $logErr -Force }

$server = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WindowStyle Hidden -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr

# Poll health endpoint
$healthUrl = "http://localhost:$Port/api/health"
$maxAttempts = 120
$started = $false
for ($i = 0; $i -lt $maxAttempts; $i++) {
  try {
    # Try 127.0.0.1 first to avoid IPv6 localhost quirks
    $res = Invoke-WebRequest -Uri ("http://127.0.0.1:$Port/api/health") -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $started = $true; break }
  } catch {
    Start-Sleep -Milliseconds 800
  }
  # Fallback: check localhost URL as well
  if (-not $started) {
    try {
      $res2 = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
      if ($res2.StatusCode -eq 200) { $started = $true; break }
    } catch {}
  }
  # As a last resort, detect readiness by log line
  if (-not $started -and (Test-Path $logOut)) {
    try {
      $tail = Get-Content $logOut -Tail 50 -ErrorAction SilentlyContinue
      if ($tail -match 'serving on port') { $started = $true; break }
    } catch {}
  }
}

if ($started) {
  Write-Host "Server is up. Opening http://localhost:$Port ..."
  Start-Process "http://localhost:$Port"
  Write-Host "Press Ctrl+C to stop the server in its window/process (PID $($server.Id))."
} else {
  Write-Warning "Server did not become ready. Stopping process PID $($server.Id)."
  try { Stop-Process -Id $server.Id -Force } catch {}
  if ((Test-Path $logOut) -or (Test-Path $logErr)) {
    Write-Host "--- Server stdout (last 200) ---"
    if (Test-Path $logOut) { Get-Content $logOut -Tail 200 | Write-Host }
    Write-Host "--- Server stderr (last 200) ---"
    if (Test-Path $logErr) { Get-Content $logErr -Tail 200 | Write-Host }
  }
  exit 1
}

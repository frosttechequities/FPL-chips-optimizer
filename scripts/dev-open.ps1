param(
  [int]$Port = [int]($env:PORT) -as [int]
)

if (-not $Port) { $Port = 5000 }

# Use port 5001 for backend, 5000 for frontend
$BackendPort = 5001
$FrontendPort = $Port

Write-Host "Starting backend server on port $BackendPort..."
Write-Host "Starting frontend dev server (HMR) on port $FrontendPort..."

$env:NODE_ENV = 'development'
if ($env:PORT -eq $null) { $env:PORT = "$BackendPort" }

# Start backend server via tsx
$job = Start-Job -ScriptBlock { param($backendPort) $env:NODE_ENV='development'; $env:PORT = "$backendPort"; npx tsx server/index.ts } -ArgumentList $BackendPort

# Poll backend health endpoint (wait longer for data pipeline initialization)
$healthUrl = "http://localhost:$BackendPort/api/health"
$maxAttempts = 120  # Increased from 60 to 120 attempts
$started = $false
for ($i = 0; $i -lt $maxAttempts; $i++) {
  try {
    $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $started = $true; break }
  } catch {
    Start-Sleep -Milliseconds 1000  # Wait 1 second between attempts
  }
}

if ($started) {
  Write-Host "Backend server is up on port $BackendPort."
  Write-Host "Starting frontend dev server on port $FrontendPort..."

  # Start Vite dev server in foreground (it will handle the frontend)
  npx vite --host --port $FrontendPort
} else {
  Write-Warning "Backend server did not become ready. Stopping job $($job.Id)."
  try { Stop-Job -Id $job.Id -Force } catch {}
  exit 1
}

param(
  [int]$Port = [int]($env:PORT) -as [int]
)

if (-not $Port) { $Port = 5000 }

Write-Host "Starting dev server (HMR) on port $Port..."

$env:NODE_ENV = 'development'
if ($env:PORT -eq $null) { $env:PORT = "$Port" }

# Start dev server via tsx
$job = Start-Job -ScriptBlock { param($port) $env:NODE_ENV='development'; if ($env:PORT -eq $null) { $env:PORT = "$port" }; npx tsx server/index.ts } -ArgumentList $Port

# Poll health endpoint
$healthUrl = "http://localhost:$Port/api/health"
$maxAttempts = 60
$started = $false
for ($i = 0; $i -lt $maxAttempts; $i++) {
  try {
    $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $started = $true; break }
  } catch {
    Start-Sleep -Milliseconds 800
  }
}

if ($started) {
  Write-Host "Server is up. Opening http://localhost:$Port ..."
  Start-Process "http://localhost:$Port"
  Write-Host "Dev server running in background job Id $($job.Id). Use 'Stop-Job $($job.Id)' to stop."
} else {
  Write-Warning "Server did not become ready. Stopping job $($job.Id)."
  try { Stop-Job -Id $job.Id -Force } catch {}
  exit 1
}


param(
  [int]$Port = 5000  # Always use 5000 for frontend
)

Write-Host "Starting frontend dev server (HMR) on port $Port..."

$env:NODE_ENV = 'development'

# Start Vite dev server
npx vite --host --port $Port

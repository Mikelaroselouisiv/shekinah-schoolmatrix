# Stop Docker project schoolmatrix-server on this DEV machine.
# Frees port 3000 for Nest (npm run dev:backend).
# Does NOT touch GCP VM or a remote school machine.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root "apps\desktop\server-stack\docker-compose.yml"

Write-Host "Stopping local Server stack (project schoolmatrix-server)..." -ForegroundColor Cyan

$names = @(
  "shekinah_api_server",
  "shekinah_postgres_server",
  "shekinah_sync_agent"
)

foreach ($n in $names) {
  docker stop $n 2>$null | Out-Null
}

if (Test-Path $compose) {
  # Ignore compose variable warnings (DB_PASS etc.) — we only need containers down.
  cmd /c "docker compose -f `"$compose`" -p schoolmatrix-server down >NUL 2>&1"
}

Write-Host "OK - you can run: npm run dev:backend" -ForegroundColor Green
Write-Host "Postgres DEV (shekinah-db-dev) left running." -ForegroundColor DarkGray

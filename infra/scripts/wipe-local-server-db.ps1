# Wipe complet de la base Postgres LOCALE (stack Docker Server).
# Sur le serveur ecole:
#   1) Copie ce fichier sur le Bureau
#   2) PowerShell:
#      powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Desktop\wipe-local-server-db.ps1"

[CmdletBinding()]
param(
  [string] $StackDir = (Join-Path $env:ProgramData 'Shekinah SchoolMatrix\server-stack')
)

$ErrorActionPreference = 'Stop'

function Write-Step([string] $msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

$pg = 'shekinah_postgres_server'
$api = 'shekinah_api_server'
$sync = 'shekinah_sync_agent'
$dbUser = 'schoolmatrix'
$dbName = 'schoolmatrix'

$envFile = Join-Path $StackDir '.env.server'
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*DB_USER\s*=\s*(.+)$') { $dbUser = $Matches[1].Trim().Trim('"') }
    if ($_ -match '^\s*DB_NAME\s*=\s*(.+)$') { $dbName = $Matches[1].Trim().Trim('"') }
  }
}

Write-Step "DB=$dbUser/$dbName"

Write-Step 'Stop API + sync'
docker stop $api $sync 2>$null | Out-Null

Write-Step 'Start Postgres'
docker start $pg | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Impossible de demarrer $pg — Docker est pret ?" }

Write-Step 'Wait Postgres'
$ready = $false
for ($i = 1; $i -le 40; $i++) {
  docker exec $pg pg_isready -U $dbUser -d $dbName 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Postgres pas pret.' }

Write-Step 'DROP SCHEMA public CASCADE'
$sql = @'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO schoolmatrix;
GRANT ALL ON SCHEMA public TO public;
'@
$sql | docker exec -i $pg psql -U $dbUser -d $dbName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'wipe SQL failed' }

Write-Step 'Start API + sync'
docker start $api $sync 2>$null | Out-Null
if (Test-Path -LiteralPath $StackDir) {
  Push-Location $StackDir
  try {
    docker compose --env-file .env.server -f docker-compose.yml up -d 2>$null
    if ($LASTEXITCODE -ne 0) {
      docker-compose --env-file .env.server -f docker-compose.yml up -d 2>$null
    }
  } finally {
    Pop-Location
  }
}

Write-Step 'Wait API'
$apiUp = $false
for ($i = 1; $i -le 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -lt 500) { $apiUp = $true; break }
  } catch {}
  Start-Sleep -Seconds 3
}
if (-not $apiUp) {
  docker logs $api --tail 40
  throw 'API locale ne repond pas.'
}

$users = (docker exec $pg psql -U $dbUser -d $dbName -tAc 'SELECT count(*) FROM users;').Trim()
try {
  $s = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/setup/status' -UseBasicParsing -TimeoutSec 5
  Write-Host "users=$users setup=$($s.Content)" -ForegroundColor Green
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { '?' }
  Write-Host "users=$users setup=HTTP $code" -ForegroundColor Yellow
  throw 'setup/status inattendu'
}

if ($users -ne '0') { throw "pas vide: users=$users" }

Write-Host ''
Write-Host 'OK — base locale vide. Relance SchoolMatrix Server et cree le SUPER_ADMIN.' -ForegroundColor Green

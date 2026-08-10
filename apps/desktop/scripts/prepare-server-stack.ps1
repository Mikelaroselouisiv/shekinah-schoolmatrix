#Requires -Version 5.1
<#
  Prepare server-stack/ before dist:win:server :

  Ce script EMBARQUE le stack pour les machines Server ÉCOLE (installateur NSIS).
  Ce n'est PAS un deploy sur la VM GCP ni sur le Docker de la machine de développement.

  Flux prod école :
    AR backend:latest + postgres + sync-agent build
      → docker save → server-stack/images/*.tar
      → electron-builder extraResources
      → école télécharge la MAJ → bootstrap.ps1 → docker load + recreate sur LE Docker de l'école

  Prérequis : Artifact Registry backend:latest doit déjà être la version voulue
  (ship-all.ps1 attend le CI backend avant d'appeler ce script).

  Aussi :
  - defaults.env with cloud SYNC_API_KEY + GCS + GEMINI (required) — zero manual config on site
  - credentials/gcs-sa.json for GOOGLE_APPLICATION_CREDENTIALS in Docker
#>
$ErrorActionPreference = 'Stop'

$DesktopRoot = Split-Path $PSScriptRoot -Parent
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$StackDir = Join-Path $DesktopRoot 'server-stack'
$StackImages = Join-Path $StackDir 'images'
$CredDir = Join-Path $StackDir 'credentials'
$GcsCredDest = Join-Path $CredDir 'gcs-sa.json'
$DefaultsEnv = Join-Path $StackDir 'defaults.env'
$SecretsKey = Join-Path $Root 'secrets\sync-api-key.txt'
$SecretsGemini = Join-Path $Root 'secrets\gemini-api-key.txt'
$SecretsGeminiModel = Join-Path $Root 'secrets\gemini-model.txt'
$SecretsGcs = Join-Path $Root 'secrets\gcs-desktop-server.json'
$InfraScripts = Join-Path $Root 'infra\scripts'

New-Item -ItemType Directory -Force -Path $StackImages | Out-Null
New-Item -ItemType Directory -Force -Path $CredDir | Out-Null

function Ensure-SyncKey {
  if ((Test-Path -LiteralPath $SecretsKey)) {
    $k = (Get-Content -LiteralPath $SecretsKey -Raw).Trim()
    if ($k -and $k -notmatch '^CHANGE_ME') { return $k }
  }
  Write-Host '==> secrets/sync-api-key.txt manquant — recuperation auto (VM / Secret Manager)' -ForegroundColor Yellow
  $script = Join-Path $InfraScripts 'gcp-provision-sync-key.ps1'
  if (-not (Test-Path -LiteralPath $script)) {
    throw 'infra/scripts/gcp-provision-sync-key.ps1 introuvable'
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -FetchOnly
  if ($LASTEXITCODE -ne 0) { throw 'Echec provision SYNC_API_KEY' }
  if (-not (Test-Path -LiteralPath $SecretsKey)) {
    throw 'secrets/sync-api-key.txt toujours manquant apres provision'
  }
  $k = (Get-Content -LiteralPath $SecretsKey -Raw).Trim()
  if (-not $k -or $k -match '^CHANGE_ME') {
    throw 'secrets/sync-api-key.txt vide ou placeholder'
  }
  return $k
}

function Ensure-GcsCredentials {
  $script = Join-Path $InfraScripts 'gcp-provision-desktop-gcs-key.ps1'
  if (-not (Test-Path -LiteralPath $SecretsGcs)) {
    Write-Host '==> Cle GCS desktop manquante — provision auto' -ForegroundColor Yellow
    if (-not (Test-Path -LiteralPath $script)) {
      throw 'infra/scripts/gcp-provision-desktop-gcs-key.ps1 introuvable'
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
    if ($LASTEXITCODE -ne 0) { throw 'Echec provision cle GCS desktop' }
  } elseif (Test-Path -LiteralPath $script) {
    # Assure SA + Secret Manager a jour sans forcer une nouvelle cle
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'Provision GCS a renvoye une erreur — on continue avec la cle locale'
    }
  }
  if (-not (Test-Path -LiteralPath $SecretsGcs)) {
    throw 'secrets/gcs-desktop-server.json manquant — impossible de builder un Server avec GCS'
  }
  Copy-Item -LiteralPath $SecretsGcs -Destination $GcsCredDest -Force
  Write-Host "credentials/gcs-sa.json pret (GCS embarque dans l installateur)" -ForegroundColor Green
}

function Ensure-GeminiKey {
  if ((Test-Path -LiteralPath $SecretsGemini)) {
    $k = (Get-Content -LiteralPath $SecretsGemini -Raw).Trim()
    if ($k) {
      $m = 'gemini-3.6-flash'
      if (Test-Path -LiteralPath $SecretsGeminiModel) {
        $mm = (Get-Content -LiteralPath $SecretsGeminiModel -Raw).Trim()
        if ($mm) { $m = $mm }
      }
      return @{ Key = $k; Model = $m }
    }
  }
  Write-Host '==> secrets/gemini-api-key.txt manquant — recuperation auto (SM / VM / .env.dev)' -ForegroundColor Yellow
  $script = Join-Path $InfraScripts 'gcp-provision-gemini-key.ps1'
  if (-not (Test-Path -LiteralPath $script)) {
    throw 'infra/scripts/gcp-provision-gemini-key.ps1 introuvable'
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -FetchOnly
  if ($LASTEXITCODE -ne 0) { throw 'Echec provision GEMINI_API_KEY' }
  if (-not (Test-Path -LiteralPath $SecretsGemini)) {
    throw 'secrets/gemini-api-key.txt toujours manquant apres provision'
  }
  $k = (Get-Content -LiteralPath $SecretsGemini -Raw).Trim()
  if (-not $k) { throw 'secrets/gemini-api-key.txt vide' }
  $m = 'gemini-3.6-flash'
  if (Test-Path -LiteralPath $SecretsGeminiModel) {
    $mm = (Get-Content -LiteralPath $SecretsGeminiModel -Raw).Trim()
    if ($mm) { $m = $mm }
  }
  return @{ Key = $k; Model = $m }
}

$SyncKey = Ensure-SyncKey
Ensure-GcsCredentials
$Gemini = Ensure-GeminiKey

$defaultsLines = @(
  'DB_USER=schoolmatrix',
  'DB_PASS=CHANGE_ME',
  'DB_NAME=schoolmatrix',
  'JWT_SECRET=CHANGE_ME',
  'NODE_ID=LOCAL',
  "SYNC_API_KEY=$SyncKey",
  'REMOTE_API_URL=http://34.118.138.96',
  'SYNC_INTERVAL_MS=5000',
  'SYNC_KICK_URL=http://sync-agent:3911/kick',
  'GCS_BUCKET=shekinah-schoolmatrix-assets',
  'GCS_PREFIX=schoolmatrix',
  'GCS_PROJECT_ID=shekinah-schoolmatrix',
  'GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcs-sa.json',
  "GEMINI_API_KEY=$($Gemini.Key)",
  "GEMINI_MODEL=$($Gemini.Model)"
)
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($DefaultsEnv, $defaultsLines, $utf8)
Write-Host 'defaults.env pret (SYNC_API_KEY + GCS + GEMINI injectes)'

$Registry = 'northamerica-northeast1-docker.pkg.dev/shekinah-schoolmatrix/schoolmatrix-backend'
$Backend = "${Registry}/backend:latest"
$Postgres = 'postgres:16'

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker requis pour prepare:server-stack (export images .tar).'
}

Write-Host '==> Pull images'
docker pull $Backend
if ($LASTEXITCODE -ne 0) { throw "docker pull backend a echoue: $Backend" }
docker pull $Postgres
if ($LASTEXITCODE -ne 0) { throw 'docker pull postgres:16 a echoue' }

$AgentDir = Join-Path $Root 'apps\sync-agent'
Write-Host '==> Build sync-agent'
docker build -t schoolmatrix/sync-agent:bundle $AgentDir
if ($LASTEXITCODE -ne 0) { throw 'docker build sync-agent a echoue' }

docker tag $Backend schoolmatrix/backend:bundle
docker tag $Postgres schoolmatrix/postgres:bundle

Write-Host '==> docker save'
docker save schoolmatrix/backend:bundle -o (Join-Path $StackImages 'backend.tar')
docker save schoolmatrix/postgres:bundle -o (Join-Path $StackImages 'postgres.tar')
docker save schoolmatrix/sync-agent:bundle -o (Join-Path $StackImages 'sync-agent.tar')

$missing = @('backend.tar', 'postgres.tar', 'sync-agent.tar') | Where-Object {
  -not (Test-Path (Join-Path $StackImages $_))
}
if ($missing.Count -gt 0) {
  throw "Images manquantes apres save: $($missing -join ', ')"
}

Write-Host 'server-stack pret pour dist:win:server (images + defaults.env + SYNC_API_KEY + GCS + GEMINI).'

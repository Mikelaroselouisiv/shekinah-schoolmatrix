#Requires -Version 5.1
<#
.SYNOPSIS
  Recupere / aligne GEMINI_API_KEY pour le bundle Server (defaults.env).

.PARAMETER ApiKey
  Cle a enregistrer (local + Secret Manager). Si vide : lit secrets/, SM, ou VM.

.PARAMETER FetchOnly
  Ecrit seulement secrets/gemini-api-key.txt (et model) sans changer la VM.

.PARAMETER AlsoWriteVm
  Ajoute / aligne GEMINI_* dans /opt/schoolmatrix/.env.prod sur la VM GCP.
#>
param(
  [string] $ProjectId = 'shekinah-schoolmatrix',
  [string] $VmName = 'schoolmatrix-api',
  [string] $Zone = 'northamerica-northeast1-a',
  [string] $RemoteDir = '/opt/schoolmatrix',
  [string] $ApiKey = '',
  [string] $Model = 'gemini-3.6-flash',
  [string] $SecretId = 'schoolmatrix-gemini-api-key',
  [switch] $FetchOnly,
  [switch] $AlsoWriteVm
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $ScriptDir 'assert-schoolmatrix-gcp.ps1')
if (-not $?) { throw 'assert failed' }

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$OutKey = Join-Path $RepoRoot 'secrets\gemini-api-key.txt'
$OutModel = Join-Path $RepoRoot 'secrets\gemini-model.txt'
New-Item -ItemType Directory -Force -Path (Split-Path $OutKey) | Out-Null

function Write-Local([string] $Key, [string] $Mod) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($OutKey, $Key.Trim() + "`n", $utf8)
  [System.IO.File]::WriteAllText($OutModel, $Mod.Trim() + "`n", $utf8)
}

function Save-ToSecretManager([string] $Key) {
  gcloud services enable secretmanager.googleapis.com --project=$ProjectId --quiet | Out-Null
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $null = gcloud secrets describe $SecretId --project=$ProjectId 2>$null
  $existsCode = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($existsCode -ne 0) {
    gcloud secrets create $SecretId --project=$ProjectId --replication-policy=automatic --quiet
  }
  $tmp = Join-Path $env:TEMP "sm-gemini-$([guid]::NewGuid().ToString('n')).txt"
  try {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmp, $Key.Trim() + "`n", $utf8)
    gcloud secrets versions add $SecretId --project=$ProjectId --data-file=$tmp --quiet | Out-Null
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Get-KeyFromSecretManager {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $v = gcloud secrets versions access latest --secret=$SecretId --project=$ProjectId 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -eq 0 -and $v) { return $v.Trim() }
  return ''
}

function Get-KeyFromVm {
  $remote = @"
set -euo pipefail
ENV='$RemoteDir/.env.prod'
if sudo test -f "`$ENV"; then
  sudo grep -E '^GEMINI_API_KEY=' "`$ENV" | head -1 | cut -d= -f2- || true
fi
"@
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = gcloud compute ssh $VmName --zone=$Zone --project=$ProjectId --command=$remote 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -eq 0 -and $out) {
    $line = ($out | Select-Object -Last 1).ToString().Trim()
    if ($line) { return $line }
  }
  return ''
}

function Get-KeyFromLocalSecrets {
  if (Test-Path -LiteralPath $OutKey) {
    $k = (Get-Content -LiteralPath $OutKey -Raw).Trim()
    if ($k) { return $k }
  }
  return ''
}

function Get-KeyFromDevEnv {
  $dev = Join-Path $RepoRoot 'shekinah-schoolmatrix-backend\.env.dev'
  if (-not (Test-Path -LiteralPath $dev)) { return '' }
  foreach ($line in Get-Content -LiteralPath $dev) {
    if ($line -match '^\s*GEMINI_API_KEY=(.+)$') {
      $v = $Matches[1].Trim()
      if ($v) { return $v }
    }
  }
  return ''
}

function Get-ModelLocal {
  if (Test-Path -LiteralPath $OutModel) {
    $m = (Get-Content -LiteralPath $OutModel -Raw).Trim()
    if ($m) { return $m }
  }
  return $Model
}

function Write-VmEnv([string] $Key, [string] $Mod) {
  $remote = @"
set -euo pipefail
ENV='$RemoteDir/.env.prod'
sudo test -f "`$ENV"
sudo sed -i '/^GEMINI_API_KEY=/d' "`$ENV"
sudo sed -i '/^GEMINI_MODEL=/d' "`$ENV"
printf 'GEMINI_API_KEY=$Key\nGEMINI_MODEL=$Mod\n' | sudo tee -a "`$ENV" >/dev/null
"@
  gcloud compute ssh $VmName --zone=$Zone --project=$ProjectId --command=$remote
  if ($LASTEXITCODE -ne 0) { throw 'Echec ecriture GEMINI_* sur la VM' }
}

$key = $ApiKey.Trim()
if (-not $key) { $key = Get-KeyFromLocalSecrets }
if (-not $key) { $key = Get-KeyFromSecretManager }
if (-not $key) { $key = Get-KeyFromVm }
if (-not $key) { $key = Get-KeyFromDevEnv }

if (-not $key) {
  throw 'GEMINI_API_KEY introuvable (secrets/gemini-api-key.txt, Secret Manager, VM, ou .env.dev).'
}

$mod = Get-ModelLocal
Write-Local $key $mod

if (-not $FetchOnly) {
  Save-ToSecretManager $key
  Write-Host 'GEMINI_API_KEY alignee dans Secret Manager' -ForegroundColor Green
}

if ($AlsoWriteVm) {
  Write-VmEnv $key $mod
  Write-Host 'GEMINI_* alignees sur la VM' -ForegroundColor Green
}

Write-Host "GEMINI_API_KEY pret: $OutKey" -ForegroundColor Green
Write-Host "GEMINI_MODEL=$mod" -ForegroundColor Green

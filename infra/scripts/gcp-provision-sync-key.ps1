#Requires -Version 5.1
<#
.SYNOPSIS
  Ajoute / aligne SYNC_API_KEY dans /opt/schoolmatrix/.env.prod sur la VM GCP.

.PARAMETER SyncKey
  Cle a ecrire. Si vide : lit la cle VM existante, sinon Secret Manager, sinon en genere une.

.PARAMETER FetchOnly
  Ne fait que recuperer la cle (VM ou Secret Manager) vers secrets/sync-api-key.txt.
  Ne change pas la VM sauf si aucune cle n'existe nulle part.
#>
param(
  [string] $ProjectId = 'shekinah-schoolmatrix',
  [string] $VmName = 'schoolmatrix-api',
  [string] $Zone = 'northamerica-northeast1-a',
  [string] $RemoteDir = '/opt/schoolmatrix',
  [string] $SyncKey = '',
  [string] $SecretId = 'schoolmatrix-sync-api-key',
  [switch] $FetchOnly
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $ScriptDir 'assert-schoolmatrix-gcp.ps1')
if (-not $?) { throw 'assert failed' }

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$OutFile = Join-Path $RepoRoot 'secrets\sync-api-key.txt'
New-Item -ItemType Directory -Force -Path (Split-Path $OutFile) | Out-Null

function New-Secret([int] $Bytes = 32) {
  $buf = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return ([Convert]::ToBase64String($buf) -replace '[/+=]', 'x')
}

function Write-LocalKey([string] $Key) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($OutFile, $Key.Trim() + "`n", $utf8)
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
  $tmp = Join-Path $env:TEMP "sm-sync-$([guid]::NewGuid().ToString('n')).txt"
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
  sudo grep -E '^SYNC_API_KEY=' "`$ENV" | head -1 | cut -d= -f2- || true
fi
"@
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & gcloud compute ssh $VmName --zone=$Zone --project=$ProjectId --tunnel-through-iap --command=$remote 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) {
      $line = ($out | Out-String).Trim() -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1
      if ($line) { return $line.Trim() }
    }
  } finally {
    $ErrorActionPreference = $prev
  }
  return ''
}

function Set-KeyOnVm([string] $Key) {
  # Ecriture via fichier temporaire pour eviter le parsing casse de gcloud --command sous Windows
  $remoteScript = @"
set -euo pipefail
ENV='$RemoteDir/.env.prod'
sudo test -f "`$ENV" || { echo 'MISSING_ENV'; exit 1; }
sudo sed -i 's|STORAGE_ROOT=/app/storageSYNC_API_KEY=.*|STORAGE_ROOT=/app/storage|' "`$ENV" || true
sudo sed -i '/^SYNC_API_KEY=/d' "`$ENV"
printf 'SYNC_API_KEY=$Key\n' | sudo tee -a "`$ENV" >/dev/null
sudo chmod 600 "`$ENV"
echo SYNC_KEY_OK
"@
  $tmp = Join-Path $env:TEMP "sm-sync-vm-$([guid]::NewGuid().ToString('n')).sh"
  try {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmp, $remoteScript.Replace("`r`n", "`n"), $utf8)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Get-Content -LiteralPath $tmp -Raw | & gcloud compute ssh $VmName --zone=$Zone --project=$ProjectId --tunnel-through-iap --command='bash -s'
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw 'Echec ecriture SYNC_API_KEY sur la VM' }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

# 1) Cle locale deja bonne
if (-not $SyncKey -and (Test-Path -LiteralPath $OutFile)) {
  $local = (Get-Content -LiteralPath $OutFile -Raw).Trim()
  if ($local -and $local -notmatch '^CHANGE_ME') {
    if ($FetchOnly) {
      Write-Host "SYNC_API_KEY locale OK: $OutFile" -ForegroundColor Green
      exit 0
    }
    $SyncKey = $local
  }
}

# 2) Secret Manager
if (-not $SyncKey) {
  $SyncKey = Get-KeyFromSecretManager
  if ($SyncKey) {
    Write-Host 'SYNC_API_KEY lue depuis Secret Manager' -ForegroundColor Green
  }
}

# 3) VM existante
if (-not $SyncKey) {
  $SyncKey = Get-KeyFromVm
  if ($SyncKey) {
    Write-Host 'SYNC_API_KEY lue depuis la VM cloud' -ForegroundColor Green
  }
}

# 4) Generer
$created = $false
if (-not $SyncKey) {
  $SyncKey = New-Secret 32
  $created = $true
  Write-Host 'Nouvelle SYNC_API_KEY generee' -ForegroundColor Yellow
}

Write-LocalKey $SyncKey
Save-ToSecretManager $SyncKey

if ($created) {
  try {
    Set-KeyOnVm $SyncKey
    Write-Host 'SYNC_API_KEY alignee sur la VM' -ForegroundColor Green
  } catch {
    Write-Warning "VM non mise a jour ($($_.Exception.Message)) — cle locale + Secret Manager OK"
  }
} elseif (-not $FetchOnly) {
  try {
    Set-KeyOnVm $SyncKey
    Write-Host 'SYNC_API_KEY alignee sur la VM' -ForegroundColor Green
  } catch {
    Write-Warning "VM non mise a jour ($($_.Exception.Message)) — cle locale + Secret Manager OK"
  }
}

Write-Host "SYNC_API_KEY pret: $OutFile" -ForegroundColor Green
if ($created) {
  Write-Host 'Relancez le backend cloud si la cle vient de changer (deploy).' -ForegroundColor Yellow
}

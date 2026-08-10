#Requires -Version 5.1
<#
.SYNOPSIS
  Crée le compte de service desktop Server + clé JSON pour GCS (embarquee dans l'installeur).

.DESCRIPTION
  Zero config sur site : prepare-server-stack.ps1 appelle ce script, copie la clé
  dans server-stack/credentials/, et docker-compose monte GOOGLE_APPLICATION_CREDENTIALS.

  La clé est aussi stockée dans Secret Manager (schoolmatrix-desktop-gcs-key)
  pour les builds CI / machines de build.
#>
param(
  [string] $ProjectId = 'shekinah-schoolmatrix',
  [string] $Bucket = 'shekinah-schoolmatrix-assets',
  [string] $SaName = 'schoolmatrix-desktop',
  [string] $SecretId = 'schoolmatrix-desktop-gcs-key',
  [switch] $ForceNewKey
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $ScriptDir 'assert-schoolmatrix-gcp.ps1')
if (-not $?) { throw 'assert failed' }

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$SecretsDir = Join-Path $RepoRoot 'secrets'
$LocalKey = Join-Path $SecretsDir 'gcs-desktop-server.json'
$SaEmail = "$SaName@$ProjectId.iam.gserviceaccount.com"
$BucketUri = "gs://$Bucket"

New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

Write-Host "==> Enable Secret Manager API" -ForegroundColor Cyan
gcloud services enable secretmanager.googleapis.com --project=$ProjectId --quiet | Out-Null

Write-Host "==> Service account $SaEmail" -ForegroundColor Cyan
$prevErr = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$exists = gcloud iam service-accounts describe $SaEmail --project=$ProjectId 2>$null
$describeCode = $LASTEXITCODE
$ErrorActionPreference = $prevErr
if ($describeCode -ne 0 -or -not $exists) {
  gcloud iam service-accounts create $SaName `
    --display-name='SchoolMatrix Desktop Server (GCS)' `
    --project=$ProjectId
  if ($LASTEXITCODE -ne 0) { throw "Impossible de creer le SA $SaEmail" }
}

Write-Host "==> Bucket IAM objectAdmin for desktop SA" -ForegroundColor Cyan
$prevErr = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
gsutil iam ch "serviceAccount:${SaEmail}:roles/storage.objectAdmin" $BucketUri 2>$null
$ErrorActionPreference = $prevErr

function Test-SecretExists {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $desc = gcloud secrets describe $SecretId --project=$ProjectId 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return ($code -eq 0 -and $desc)
}

function Save-KeyJson([string] $JsonPath) {
  if (-not (Test-Path -LiteralPath $JsonPath)) { throw "Cle JSON introuvable: $JsonPath" }
  $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
  if (-not $raw -or $raw -notmatch '"private_key"') {
    throw "Fichier cle GCS invalide: $JsonPath"
  }

  if (-not (Test-SecretExists)) {
    gcloud secrets create $SecretId `
      --project=$ProjectId `
      --replication-policy=automatic `
      --quiet
  }
  $tmp = Join-Path $env:TEMP "sm-gcs-$([guid]::NewGuid().ToString('n')).json"
  try {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmp, $raw.TrimEnd() + "`n", $utf8)
    gcloud secrets versions add $SecretId --project=$ProjectId --data-file=$tmp --quiet | Out-Null
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Secret Manager: $SecretId mis a jour" -ForegroundColor Green
}

# Reutiliser la cle locale si presente (sauf ForceNewKey)
if ((Test-Path -LiteralPath $LocalKey) -and -not $ForceNewKey) {
  Write-Host "Cle locale deja presente: $LocalKey" -ForegroundColor Green
  Save-KeyJson $LocalKey
  Write-Host "GCS desktop key OK (reuse)" -ForegroundColor Green
  exit 0
}

# Essayer Secret Manager d'abord
$smOk = $false
if (-not $ForceNewKey) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $fromSm = gcloud secrets versions access latest --secret=$SecretId --project=$ProjectId 2>$null
  $smCode = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($smCode -eq 0 -and $fromSm -and ($fromSm -match '"private_key"')) {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($LocalKey, $fromSm.TrimEnd() + "`n", $utf8)
    $smOk = $true
    Write-Host "Cle restauree depuis Secret Manager → $LocalKey" -ForegroundColor Green
  }
}

if (-not $smOk) {
  Write-Host "==> Creation cle JSON service account" -ForegroundColor Cyan
  gcloud iam service-accounts keys create $LocalKey `
    --iam-account=$SaEmail `
    --project=$ProjectId
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $LocalKey)) {
    throw 'Impossible de creer la cle GCS desktop'
  }
  Save-KeyJson $LocalKey
}

Write-Host "GCS desktop key pret: $LocalKey" -ForegroundColor Green

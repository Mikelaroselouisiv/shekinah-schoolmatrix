#Requires -Version 5.1
<#
.SYNOPSIS
  Publie un APK mobile + latest.json vers GCS (feed MAJ in-app).

.PARAMETER ApkPath
  Chemin vers le fichier .apk

.PARAMETER Version
  Semver (ex. 1.0.1) — défaut : lu depuis apps/mobile/app.json

.PARAMETER VersionCode
  Android versionCode — défaut : lu depuis apps/mobile/app.json

.PARAMETER Notes
  Notes affichées dans la modal MAJ

.PARAMETER Mandatory
  Si défini, l’app masque « Plus tard »

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/scripts/upload-mobile-apk.ps1 -ApkPath ./SchoolMatrix.apk
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ApkPath,

  [string] $Version = '',
  [int] $VersionCode = 0,
  [string] $Notes = '',
  [switch] $Mandatory,
  [string] $Bucket = 'shekinah-schoolmatrix-assets'
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$AppJsonPath = Join-Path $RepoRoot 'apps\mobile\app.json'

if (-not (Test-Path -LiteralPath $ApkPath)) {
  Write-Error "APK introuvable: $ApkPath"
}

if (-not (Get-Command gsutil -ErrorAction SilentlyContinue)) {
  Write-Error 'gsutil requis (Google Cloud SDK).'
}

$appJson = Get-Content -LiteralPath $AppJsonPath -Raw | ConvertFrom-Json
if (-not $Version) {
  $Version = [string]$appJson.expo.version
}
if ($VersionCode -le 0) {
  $VersionCode = [int]$appJson.expo.android.versionCode
}
if (-not $Version -or $VersionCode -le 0) {
  Write-Error 'Version / versionCode manquants (passez -Version / -VersionCode ou renseignez app.json).'
}

$apkFile = Get-Item -LiteralPath $ApkPath
$destName = "SchoolMatrix-$Version+$VersionCode.apk"
$destPrefix = "gs://$Bucket/installers/mobile/"
$apkDest = "$destPrefix$destName"
$publicApkUrl = "https://storage.googleapis.com/$Bucket/installers/mobile/$destName"

$size = [int64]$apkFile.Length
$sha256 = (Get-FileHash -LiteralPath $apkFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$publishedAt = [DateTime]::UtcNow.ToString('o')

Write-Host "Upload APK -> $apkDest"
& gsutil -h "Cache-Control:public,max-age=31536000,immutable" cp $apkFile.FullName $apkDest
if ($LASTEXITCODE -ne 0) { throw "gsutil cp APK a echoue" }

$manifest = [ordered]@{
  version     = $Version
  versionCode = $VersionCode
  apkUrl      = $publicApkUrl
  sha256      = $sha256
  size        = $size
  publishedAt = $publishedAt
  notes       = if ($Notes) { $Notes } else { "Shekinah $Version ($VersionCode)" }
  mandatory   = [bool]$Mandatory
}

$tmpJson = Join-Path ([System.IO.Path]::GetTempPath()) ("schoolmatrix-mobile-latest-{0}.json" -f [guid]::NewGuid().ToString('N'))
($manifest | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $tmpJson -Encoding utf8

$latestDest = "${destPrefix}latest.json"
Write-Host "Upload feed -> $latestDest"
& gsutil -h "Cache-Control:no-store,max-age=0" cp $tmpJson $latestDest
if ($LASTEXITCODE -ne 0) { throw "gsutil cp latest.json a echoue" }
Remove-Item -LiteralPath $tmpJson -Force -ErrorAction SilentlyContinue

Write-Host "Termine."
Write-Host "  Feed: https://storage.googleapis.com/$Bucket/installers/mobile/latest.json"
Write-Host "  APK:  $publicApkUrl"
Write-Host "  sha256: $sha256"
Write-Host "  size: $size"

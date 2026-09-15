#Requires -Version 5.1
<#
.SYNOPSIS
  Bump version mobile → EAS build APK → download artifact → upload feed GCS.

.DESCRIPTION
  Equivaut electron-updater côté desktop, pour l’APK Expo.
  Le checker in-app lit installers/mobile/latest.json.

  Important: le premier APK installé doit déjà contenir le checker ;
  les ships suivants notifient les appareils.

.PARAMETER Bump
  patch | minor | major | none

.PARAMETER Profile
  preview (défaut) | production | development

.PARAMETER Notes
  Notes pour la bannière MAJ

.PARAMETER SkipBuild
  Ne pas lancer eas build — uploader un APK local (-ApkPath)

.PARAMETER ApkPath
  APK local si -SkipBuild

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/scripts/ship-mobile.ps1 -Bump patch

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/scripts/ship-mobile.ps1 -Bump none -SkipBuild -ApkPath ./app.apk
#>
param(
  [ValidateSet('patch', 'minor', 'major', 'none')]
  [string] $Bump = 'patch',

  [ValidateSet('preview', 'production', 'development')]
  [string] $Profile = 'preview',

  [string] $Notes = '',
  [switch] $SkipBuild,
  [string] $ApkPath = '',
  [string] $Bucket = 'shekinah-schoolmatrix-assets',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$MobileDir = Join-Path $RepoRoot 'apps\mobile'
$AppJsonPath = Join-Path $MobileDir 'app.json'
$PkgJsonPath = Join-Path $MobileDir 'package.json'
$UploadScript = Join-Path $ScriptDir 'upload-mobile-apk.ps1'
$AssertScript = Join-Path $ScriptDir 'assert-schoolmatrix-gcp.ps1'

function Write-Step([string] $Text) {
  Write-Host ""
  Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Invoke-OrDry([string] $Label, [scriptblock] $Action) {
  if ($DryRun) {
    Write-Host "[dry-run] $Label" -ForegroundColor Yellow
    return
  }
  Write-Host ("-> {0}" -f $Label) -ForegroundColor Gray
  & $Action
}

function Bump-Semver([string] $Version, [string] $Kind) {
  $parts = $Version.Split('.')
  if ($parts.Count -lt 3) { throw "Version invalide: $Version" }
  $major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]
  switch ($Kind) {
    'major' { $major++; $minor = 0; $patch = 0 }
    'minor' { $minor++; $patch = 0 }
    'patch' { $patch++ }
    default { }
  }
  return "$major.$minor.$patch"
}

function Get-AppJsonVersion {
  $raw = Get-Content -LiteralPath $AppJsonPath -Raw
  if ($raw -match '"version"\s*:\s*"([^"]+)"') { return $Matches[1] }
  throw "Impossible de lire expo.version dans $AppJsonPath"
}

function Get-AppJsonVersionCode {
  $raw = Get-Content -LiteralPath $AppJsonPath -Raw
  if ($raw -match '"versionCode"\s*:\s*(\d+)') { return [int]$Matches[1] }
  return 1
}

function Set-MobileVersions([string] $NewVersion, [int] $NewCode) {
  $raw = [System.IO.File]::ReadAllText($AppJsonPath)
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 0xFEFF) { $raw = $raw.Substring(1) }
  $updated = [regex]::Replace($raw, '("version"\s*:\s*")[^"]+(")', "`${1}$NewVersion`${2}", 1)
  $updated = [regex]::Replace($updated, '("versionCode"\s*:\s*)\d+', "`${1}$NewCode", 1)
  if ($updated -notmatch [regex]::Escape("`"$NewVersion`"") -or $updated -notmatch "versionCode`"\s*:\s*$NewCode") {
    # fallback soft check
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($AppJsonPath, $updated, $utf8NoBom)

  $pkgRaw = [System.IO.File]::ReadAllText($PkgJsonPath)
  if ($pkgRaw.Length -gt 0 -and [int][char]$pkgRaw[0] -eq 0xFEFF) { $pkgRaw = $pkgRaw.Substring(1) }
  $pkgUpdated = [regex]::Replace($pkgRaw, '("version"\s*:\s*")[^"]+(")', "`${1}$NewVersion`${2}", 1)
  [System.IO.File]::WriteAllText($PkgJsonPath, $pkgUpdated, $utf8NoBom)
}

Write-Step 'Assert GCP tenant'
if (Test-Path -LiteralPath $AssertScript) {
  Invoke-OrDry 'assert-schoolmatrix-gcp' { & $AssertScript }
}

$oldVersion = Get-AppJsonVersion
$oldCode = Get-AppJsonVersionCode
if ($oldCode -le 0) { $oldCode = 1 }

$newVersion = if ($Bump -eq 'none') { $oldVersion } else { Bump-Semver $oldVersion $Bump }
$newCode = if ($Bump -eq 'none') { $oldCode } else { $oldCode + 1 }

Write-Step "Bump $oldVersion ($oldCode) -> $newVersion ($newCode)"
Invoke-OrDry "write app.json + package.json" {
  Set-MobileVersions $newVersion $newCode
}

$resolvedApk = $ApkPath

if (-not $SkipBuild) {
  Write-Step "EAS build Android profile=$Profile"
  if (-not (Get-Command eas -ErrorAction SilentlyContinue) -and -not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Error 'eas / npx requis (eas-cli).'
  }

  $buildJsonPath = Join-Path ([System.IO.Path]::GetTempPath()) ("eas-build-{0}.json" -f [guid]::NewGuid().ToString('N'))

  Invoke-OrDry "eas build -p android --profile $Profile --non-interactive --wait --json" {
    Push-Location $MobileDir
    try {
      $rawOut = & npx eas-cli build -p android --profile $Profile --non-interactive --wait --json 2>$null
      if ($LASTEXITCODE -ne 0) {
        throw "eas build a echoue (exit $LASTEXITCODE)"
      }
      $rawText = if ($rawOut -is [System.Array]) { ($rawOut | Out-String).Trim() } else { [string]$rawOut }
      $rawText = $rawText.Trim()
      # --json peut être un objet OU un tableau
      $jsonStart = -1
      for ($i = 0; $i -lt $rawText.Length; $i++) {
        $ch = $rawText[$i]
        if ($ch -eq '[' -or $ch -eq '{') { $jsonStart = $i; break }
      }
      if ($jsonStart -lt 0) { throw "Sortie eas build --json illisible:`n$rawText" }
      $jsonOnly = $rawText.Substring($jsonStart)
      Set-Content -LiteralPath $buildJsonPath -Value $jsonOnly -Encoding utf8

      $parsed = $jsonOnly | ConvertFrom-Json
      $build = if ($parsed -is [System.Array]) { $parsed[0] } else { $parsed }
      $artifactUrl = $null
      if ($build.artifacts -and $build.artifacts.buildUrl) {
        $artifactUrl = [string]$build.artifacts.buildUrl
      } elseif ($build.artifacts -and $build.artifacts.applicationArchiveUrl) {
        $artifactUrl = [string]$build.artifacts.applicationArchiveUrl
      }
      if (-not $artifactUrl) {
        throw "artifacts.buildUrl manquant dans la sortie EAS. Ne pas utiliser eas build:download pour les APK."
      }
      Write-Host "Artifact URL: $artifactUrl"

      $outDir = Join-Path $MobileDir 'dist'
      New-Item -ItemType Directory -Force -Path $outDir | Out-Null
      $resolvedApk = Join-Path $outDir ("SchoolMatrix-{0}+{1}.apk" -f $newVersion, $newCode)
      Write-Host "Download -> $resolvedApk"
      Invoke-WebRequest -Uri $artifactUrl -OutFile $resolvedApk
    } finally {
      Pop-Location
      Remove-Item -LiteralPath $buildJsonPath -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  if (-not $resolvedApk) {
    Write-Error '-SkipBuild requiert -ApkPath'
  }
}

if ($DryRun) {
  Write-Host "[dry-run] upload-mobile-apk Version=$newVersion VersionCode=$newCode Apk=$resolvedApk"
  return
}

if (-not $resolvedApk -or -not (Test-Path -LiteralPath $resolvedApk)) {
  Write-Error "APK introuvable apres build: $resolvedApk"
}

Write-Step 'Upload GCS feed'
& $UploadScript -ApkPath $resolvedApk -Version $newVersion -VersionCode $newCode -Notes $Notes -Bucket $Bucket

Write-Host ""
Write-Host "Ship mobile OK: $newVersion ($newCode)" -ForegroundColor Green
Write-Host "Feed: https://storage.googleapis.com/$Bucket/installers/mobile/latest.json"

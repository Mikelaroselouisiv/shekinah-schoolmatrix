#Requires -Version 5.1
<#
.SYNOPSIS
  Publie les artefacts desktop (exe, latest.yml, blockmap) vers GCS pour electron-updater.

.PARAMETER Edition
  server -> gs://shekinah-schoolmatrix-assets/installers/server/
  remote -> gs://shekinah-schoolmatrix-assets/installers/remote/

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra/scripts/upload-desktop-installer.ps1 -Edition remote
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('server', 'remote')]
  [string] $Edition,

  [string] $ReleaseDir = '',
  [string] $Bucket = 'shekinah-schoolmatrix-assets',
  [string] $Version = ''
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..')).Path
$ResolvedReleaseDir = if ($ReleaseDir) {
  (Resolve-Path -LiteralPath $ReleaseDir).Path
} else {
  # electron-builder.server.json -> release-server ; remote -> release-remote
  $candidates = if ($Edition -eq 'server') {
    @(
      # Prefer release-server-b: Cursor often locks release-server\...\app.asar (EBUSY)
      (Join-Path $RepoRoot 'apps\desktop\release-server-b'),
      (Join-Path $RepoRoot 'apps\desktop\release-server'),
      (Join-Path $RepoRoot 'apps\desktop\release')
    )
  } else {
    @(
      (Join-Path $RepoRoot 'apps\desktop\release-remote'),
      (Join-Path $RepoRoot 'apps\desktop\release-out'),
      (Join-Path $RepoRoot 'apps\desktop\release')
    )
  }
  $found = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $found) {
    Write-Error "Dossier release introuvable ($($candidates -join ' | ')) - lancez dist:win:$Edition d'abord."
  }
  (Resolve-Path -LiteralPath $found).Path
}

if (-not (Get-Command gsutil -ErrorAction SilentlyContinue)) {
  Write-Error 'gsutil requis (Google Cloud SDK). Installez gcloud puis relancez.'
}

$editionToken = if ($Edition -eq 'remote') { 'Remote' } else { 'Server' }
$dest = "gs://$Bucket/installers/$Edition/"

Write-Host "Upload $ResolvedReleaseDir -> $dest (edition=$Edition version=$Version)"

# Prefer version from latest.yml so we don't republish stale exe left in the folder
if (-not $Version) {
  $ymlPath = Join-Path $ResolvedReleaseDir 'latest.yml'
  if (Test-Path -LiteralPath $ymlPath) {
    $yml = Get-Content -LiteralPath $ymlPath -Raw
    if ($yml -match '(?m)^version:\s*[''"]?([0-9]+\.[0-9]+\.[0-9]+)') {
      $Version = $Matches[1]
      Write-Host "Version detectee via latest.yml: $Version"
    }
  }
}

$files = @()
$files += Get-ChildItem -LiteralPath $ResolvedReleaseDir -Filter 'latest.yml' -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -LiteralPath $ResolvedReleaseDir -Filter "*$editionToken*.exe" -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -LiteralPath $ResolvedReleaseDir -Filter "*$editionToken*.blockmap" -File -ErrorAction SilentlyContinue

if ($Version) {
  $files = @($files | Where-Object {
    $_.Name -eq 'latest.yml' -or $_.Name -like "*$Version*"
  })
} else {
  # Fallback: newest exe only
  $exes = @($files | Where-Object { $_.Extension -eq '.exe' } | Sort-Object LastWriteTime -Descending)
  if ($exes.Count -gt 1) {
    $keepName = $exes[0].BaseName
    $files = @($files | Where-Object {
      $_.Name -eq 'latest.yml' -or $_.BaseName -eq $keepName -or $_.Name -like "$keepName.*"
    })
  }
}

$files = $files | Sort-Object FullName -Unique
if (-not $files -or $files.Count -eq 0) {
  Write-Error "Aucun artefact a uploader dans $ResolvedReleaseDir"
}

foreach ($file in $files) {
  Write-Host "  -> $($file.Name)"
  & gsutil cp $file.FullName $dest
  if ($LASTEXITCODE -ne 0) {
    throw "gsutil cp a echoue pour $($file.Name)"
  }
}

Write-Host "Termine. Feed public: https://storage.googleapis.com/$Bucket/installers/$Edition/latest.yml"

# Build des images + démarrage des conteneurs (api + web).
# Utilise la même base qu'en dev : shekinah-db-dev (port 5433).
# Prérequis : démarrer la base avant si besoin — docker start shekinah-db-dev

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
docker compose up -d --build
if (-not $?) { exit 1 }
Write-Host "`nAPI: http://127.0.0.1:3000  |  Web: http://127.0.0.1:3001" -ForegroundColor Green

#!/usr/bin/env bash
# Exécuté EN ROOT sur la VM (sudo bash gcp-deploy-on-vm.sh)
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/opt/schoolmatrix}"
IMAGE="northamerica-northeast1-docker.pkg.dev/shekinah-schoolmatrix/schoolmatrix-backend/backend:latest"
NETWORK="schoolmatrix_default"
STORAGE_VOL="schoolmatrix_schoolmatrix_storage_cloud"

mkdir -p "${REMOTE_DIR}"
cp /tmp/docker-compose.gcp.yml "${REMOTE_DIR}/docker-compose.gcp.yml"
cd "${REMOTE_DIR}"

TOKEN=$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
echo "${TOKEN}" | docker login -u oauth2accesstoken --password-stdin https://northamerica-northeast1-docker.pkg.dev

if [[ ! -f .env.prod ]]; then
  echo "Erreur: .env.prod manquant dans ${REMOTE_DIR}" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo 'No docker compose found' >&2
  exit 1
fi

# Postgres via compose (une fois)
if ! docker ps -a --format '{{.Names}}' | grep -qx shekinah_postgres_cloud; then
  "${COMPOSE[@]}" -f docker-compose.gcp.yml --env-file .env.prod up -d postgres
  sleep 5
fi

# Backend : docker run (évite le bug ContainerConfig de docker-compose 1.29)
docker pull "${IMAGE}"
# Nom exact — évite les courses CI (deux deploys concurrent) et les filtres substring Docker
docker rm -f shekinah_api_cloud 2>/dev/null || true
# Anciens noms éventuels
docker ps -aq --filter name=schoolmatrix_api | while read -r cid; do
  [[ -n "${cid}" ]] && docker rm -f "${cid}" 2>/dev/null || true
done

docker network inspect "${NETWORK}" >/dev/null 2>&1 || docker network create "${NETWORK}"
# Attacher postgres au network si besoin
docker network connect "${NETWORK}" shekinah_postgres_cloud 2>/dev/null || true
docker volume create "${STORAGE_VOL}" >/dev/null 2>&1 || true

docker run -d \
  --name shekinah_api_cloud \
  --restart unless-stopped \
  --network "${NETWORK}" \
  --env-file .env.prod \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e STORAGE_ROOT=/app/storage \
  -e NODE_ID=CLOUD \
  -e GCS_BUCKET=shekinah-schoolmatrix-assets \
  -e GCS_PREFIX=schoolmatrix \
  -e GCS_PROJECT_ID=shekinah-schoolmatrix \
  -p 127.0.0.1:3000:3000 \
  -v "${STORAGE_VOL}:/app/storage" \
  "${IMAGE}"

sleep 3
docker ps --filter name=schoolmatrix_ --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
rm -f /tmp/docker-compose.gcp.yml /tmp/gcp-deploy-on-vm.sh
echo 'DEPLOY_OK'

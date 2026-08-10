#!/usr/bin/env bash
set -euo pipefail
ENV=/opt/schoolmatrix/.env.prod
KEY="${1:?sync key required}"
sudo sed -i 's|STORAGE_ROOT=/app/storageSYNC_API_KEY=.*|STORAGE_ROOT=/app/storage|' "$ENV" || true
sudo sed -i '/^SYNC_API_KEY=/d' "$ENV"
# newline finale si besoin
sudo bash -c "tail -c1 '$ENV' | read -r _ || echo >> '$ENV'"
echo "SYNC_API_KEY=${KEY}" | sudo tee -a "$ENV" >/dev/null
sudo chmod 600 "$ENV"
echo '--- .env.prod (masked) ---'
sudo sed -E 's/(PASS|SECRET|KEY)=.*/\1=***/' "$ENV"
cd /opt/schoolmatrix
sudo docker-compose -f docker-compose.gcp.yml --env-file .env.prod up -d --force-recreate --no-deps backend
sleep 10
echo -n 'SYNC_API_KEY length in container: '
sudo docker exec shekinah_api_cloud printenv SYNC_API_KEY | wc -c

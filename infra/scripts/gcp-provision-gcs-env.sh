#!/usr/bin/env bash
# Ajoute les variables GCS à /opt/schoolmatrix/.env.prod
set -euo pipefail
ENV=/opt/schoolmatrix/.env.prod
BUCKET="${1:-shekinah-schoolmatrix-assets}"
PREFIX="${2:-schoolmatrix}"
PROJECT="${3:-shekinah-schoolmatrix}"

sudo test -f "$ENV" || { echo "MISSING $ENV"; exit 1; }
sudo sed -i '/^GCS_BUCKET=/d;/^GCS_PREFIX=/d;/^GCS_PROJECT_ID=/d' "$ENV"
sudo bash -c "tail -c1 '$ENV' | read -r _ || echo >> '$ENV'"
{
  echo "GCS_BUCKET=${BUCKET}"
  echo "GCS_PREFIX=${PREFIX}"
  echo "GCS_PROJECT_ID=${PROJECT}"
} | sudo tee -a "$ENV" >/dev/null
sudo chmod 600 "$ENV"
echo GCS_ENV_OK
sudo sed -n '/^GCS_/p' "$ENV"

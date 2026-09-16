#!/usr/bin/env bash
# Publie un APK Android + latest.json vers GCS (MAJ in-app mobile Shekinah).
# Usage:
#   ./infra/scripts/upload-mobile-apk.sh /path/to/app.apk 1.0.2 3 "Notes optionnelles"
set -euo pipefail

APK_PATH="${1:-}"
VERSION="${2:-}"
VERSION_CODE="${3:-}"
NOTES="${4:-}"
MANDATORY="${MANDATORY:-false}"
BUCKET="${GCS_BUCKET:-shekinah-schoolmatrix-assets}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_JSON="$ROOT/apps/mobile/app.json"

if [[ -z "$APK_PATH" || ! -f "$APK_PATH" ]]; then
  echo "Usage: $0 <apk-path> [version] [versionCode] [notes]" >&2
  exit 1
fi

if [[ "$BUCKET" != "shekinah-schoolmatrix-assets" ]]; then
  echo "ABORT: bucket '$BUCKET' non autorise." >&2
  exit 1
fi

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil requis (Google Cloud SDK)." >&2
  exit 1
fi

if [[ -z "$VERSION" && -f "$APP_JSON" ]]; then
  VERSION="$(python3 -c "import json;print(json.load(open('$APP_JSON'))['expo']['version'])")"
fi
if [[ -z "$VERSION_CODE" && -f "$APP_JSON" ]]; then
  VERSION_CODE="$(python3 -c "import json;print(json.load(open('$APP_JSON'))['expo'].get('android',{}).get('versionCode') or '')")"
fi
if [[ -z "$VERSION" || -z "$VERSION_CODE" ]]; then
  echo "version et versionCode requis." >&2
  exit 1
fi

if [[ -f "$ROOT/infra/scripts/assert-schoolmatrix-gcp.ps1" ]] && command -v powershell >/dev/null 2>&1; then
  powershell -ExecutionPolicy Bypass -File "$ROOT/infra/scripts/assert-schoolmatrix-gcp.ps1" || true
fi

APK_NAME="Shekinah-${VERSION}-${VERSION_CODE}.apk"
DEST="gs://${BUCKET}/installers/mobile"
PUBLIC_URL="https://storage.googleapis.com/${BUCKET}/installers/mobile/${APK_NAME}"
TMP="$(mktemp -d)"
FEED="$TMP/latest.json"

if command -v shasum >/dev/null 2>&1; then
  SHA="$(shasum -a 256 "$APK_PATH" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA="$(sha256sum "$APK_PATH" | awk '{print $1}')"
else
  SHA="$(python3 -c "import hashlib;print(hashlib.sha256(open('$APK_PATH','rb').read()).hexdigest())")"
fi
SIZE="$(wc -c < "$APK_PATH" | tr -d ' ')"

export SM_VERSION="$VERSION"
export SM_VERSION_CODE="$VERSION_CODE"
export SM_PUBLIC_URL="$PUBLIC_URL"
export SM_NOTES="$NOTES"
export SM_SHA="$SHA"
export SM_SIZE="$SIZE"
export SM_MANDATORY="$MANDATORY"

python3 - <<'PY' >"$FEED"
import json, os
from datetime import datetime, timezone
print(json.dumps({
  "version": os.environ["SM_VERSION"],
  "versionCode": int(os.environ["SM_VERSION_CODE"]),
  "platform": "android",
  "apkUrl": os.environ["SM_PUBLIC_URL"],
  "sha256": os.environ["SM_SHA"],
  "size": int(os.environ["SM_SIZE"]),
  "publishedAt": datetime.now(timezone.utc).isoformat(),
  "notes": os.environ.get("SM_NOTES", ""),
  "mandatory": os.environ.get("SM_MANDATORY", "false").lower() in ("1", "true", "yes"),
}, indent=2))
PY

echo "Upload APK -> ${DEST}/${APK_NAME}"
gsutil -h "Cache-Control:public,max-age=31536000,immutable" cp "$APK_PATH" "${DEST}/${APK_NAME}"
gsutil cp "$APK_PATH" "${DEST}/Shekinah-latest.apk"

echo "Upload feed -> ${DEST}/latest.json"
gsutil -h "Cache-Control:no-store,max-age=0" cp "$FEED" "${DEST}/latest.json"

rm -rf "$TMP"
echo ""
echo "Termine."
echo "  Feed : https://storage.googleapis.com/${BUCKET}/installers/mobile/latest.json"
echo "  APK  : ${PUBLIC_URL}"
echo "  SHA  : ${SHA}"

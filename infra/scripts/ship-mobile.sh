#!/usr/bin/env bash
# Pipeline MAJ mobile Shekinah — équivalent de ship-all pour l’APK Android.
#
# Une commande :
#   ./infra/scripts/ship-mobile.sh
#   ./infra/scripts/ship-mobile.sh --bump patch --notes "Fix paiements"
#
# Étapes :
#   1. Bump version + versionCode (app.json)
#   2. eas build android (cloud Expo) — attend la fin
#   3. Télécharge l’APK localement (tmp)
#   4. Upload APK + latest.json → GCS (feed MAJ in-app)
#
# Prérequis :
#   - eas-cli connecté (eas whoami) ou EXPO_TOKEN
#   - Credentials Android EAS déjà créés (1er build interactif une fois)
#   - gcloud / gsutil (projet shekinah-schoolmatrix)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_JSON="$ROOT/apps/mobile/app.json"
UPLOAD_SH="$ROOT/infra/scripts/upload-mobile-apk.sh"
PROFILE="preview"
BUMP="patch"
NOTES=""
SKIP_BUMP=0
SKIP_BUILD=0
BUILD_ID_ARG=""
DRY_RUN=0

usage() {
  cat <<EOF
Usage: $0 [options]

  --bump patch|minor|major|none   Défaut: patch
  --profile preview|production    Défaut: preview
  --notes "texte"                 Affiché dans la bannière MAJ
  --skip-bump                     Ne pas modifier app.json
  --skip-build                    Ne pas lancer EAS (réutilise un build finished)
  --build-id <uuid>               Build EAS précis (sinon dernier finished)
  --dry-run                       Affiche sans exécuter
  -h, --help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump) BUMP="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    --skip-bump) SKIP_BUMP=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --build-id) BUILD_ID_ARG="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Option inconnue: $1" >&2; usage; exit 1 ;;
  esac
done

# Normalise JSON EAS (objet ou [objet]) → extrait id + url APK
eas_pick_build_json() {
  python3 -c '
import sys, json
raw = sys.stdin.read()
d = json.loads(raw)
if isinstance(d, list):
    d = d[0] if d else {}
arts = d.get("artifacts") or {}
url = arts.get("applicationArchiveUrl") or arts.get("buildUrl") or ""
print(d.get("id") or "")
print(url)
print(d.get("appVersion") or d.get("app_version") or "")
print(d.get("appBuildVersion") or d.get("app_build_version") or "")
'
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
    return 0
  fi
  echo "-> $*"
  "$@"
}

echo "=== Ship mobile Shekinah ==="
echo "Repo: $ROOT"
echo "Bump=$BUMP Profile=$PROFILE"

if ! command -v eas >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
  echo "eas-cli / npx requis." >&2
  exit 1
fi
EAS=(eas)
if ! command -v eas >/dev/null 2>&1; then
  EAS=(npx eas-cli)
fi

# --- 1. Bump app.json ---
VERSION="$(python3 -c "import json;print(json.load(open('$APP_JSON'))['expo']['version'])")"
VERSION_CODE="$(python3 -c "import json;print(int(json.load(open('$APP_JSON'))['expo'].get('android',{}).get('versionCode') or 1))")"

if [[ "$SKIP_BUMP" -eq 0 && "$BUMP" != "none" ]]; then
  echo ""
  echo "=== Bump $VERSION (code $VERSION_CODE) ==="
  read -r VERSION VERSION_CODE < <(python3 - <<PY
import json
from pathlib import Path
p = Path("$APP_JSON")
data = json.loads(p.read_text())
ver = data["expo"]["version"]
parts = [int(x) for x in ver.split(".")[:3]]
while len(parts) < 3:
    parts.append(0)
kind = "$BUMP"
if kind == "major":
    parts = [parts[0] + 1, 0, 0]
elif kind == "minor":
    parts = [parts[0], parts[1] + 1, 0]
elif kind == "patch":
    parts = [parts[0], parts[1], parts[2] + 1]
code = int(data["expo"].get("android", {}).get("versionCode") or 1) + 1
data["expo"]["version"] = f"{parts[0]}.{parts[1]}.{parts[2]}"
data["expo"].setdefault("android", {})["versionCode"] = code
if $DRY_RUN == 0:
    p.write_text(json.dumps(data, indent=2) + "\n")
print(data["expo"]["version"], code)
PY
)
  echo "Nouvelle version: $VERSION (versionCode $VERSION_CODE)"
else
  echo "Version inchangée: $VERSION (versionCode $VERSION_CODE)"
fi

cd "$ROOT/apps/mobile"

# --- 2. EAS build ---
BUILD_JSON=""
BUILD_ID="$BUILD_ID_ARG"
APK_URL=""
TMP_DIR="$(mktemp -d)"
APK_PATH="$TMP_DIR/Shekinah-$VERSION.apk"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo ""
  echo "=== EAS build android ($PROFILE) ==="
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] ${EAS[*]} build -p android --profile $PROFILE --non-interactive --wait --json"
  else
    BUILD_JSON="$("${EAS[@]}" build -p android --profile "$PROFILE" --non-interactive --wait --json)"
    {
      read -r BUILD_ID
      read -r APK_URL
      read -r _APP_VER
      read -r _APP_CODE
    } < <(echo "$BUILD_JSON" | eas_pick_build_json)
    echo "Build $BUILD_ID status=finished appVersion=${_APP_VER:-?} code=${_APP_CODE:-?}"
  fi
else
  echo ""
  echo "=== Skip build — récupération build finished ==="
fi

# --- 3. Resolve artifact URL + download APK ---
echo ""
echo "=== Téléchargement APK ==="
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] curl artifact → $APK_PATH"
else
  if [[ -z "$APK_URL" ]]; then
    if [[ -n "$BUILD_ID" ]]; then
      BUILD_JSON="$("${EAS[@]}" build:view "$BUILD_ID" --json)"
    else
      BUILD_JSON="$("${EAS[@]}" build:list -p android --status finished --limit 1 --json --non-interactive)"
    fi
    {
      read -r BUILD_ID
      read -r APK_URL
      read -r _APP_VER
      read -r _APP_CODE
    } < <(echo "$BUILD_JSON" | eas_pick_build_json)
  fi

  if [[ -z "$APK_URL" ]]; then
    echo "URL APK introuvable (build $BUILD_ID)." >&2
    exit 1
  fi

  echo "Build: $BUILD_ID"
  echo "URL:   $APK_URL"
  curl -fsSL -o "$APK_PATH" "$APK_URL"
  if [[ ! -f "$APK_PATH" || ! -s "$APK_PATH" ]]; then
    echo "Téléchargement APK échoué." >&2
    exit 1
  fi
  echo "APK: $APK_PATH ($(wc -c < "$APK_PATH") bytes)"
fi

# --- 4. Upload GCS ---
echo ""
echo "=== Upload GCS (feed MAJ) ==="
run bash "$UPLOAD_SH" "$APK_PATH" "$VERSION" "$VERSION_CODE" "$NOTES"

echo ""
echo "=== Terminé ==="
echo "Version $VERSION ($VERSION_CODE) publiée."
echo "Feed: https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/mobile/latest.json"
echo "Les APK installés verront la bannière MAJ (~8 s / 4 h)."
if [[ "$SKIP_BUMP" -eq 0 && "$BUMP" != "none" && "$DRY_RUN" -eq 0 ]]; then
  echo ""
  echo "Pense à committer apps/mobile/app.json (version bump)."
fi

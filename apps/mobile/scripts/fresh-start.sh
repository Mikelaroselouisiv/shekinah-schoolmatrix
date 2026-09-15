#!/usr/bin/env bash
# Relance Expo en vidant Metro + en tuant Expo Go sur le simulateur.
# `expo start -c` puis `a` ne suffit PAS : Expo Go Android garde le bundle JS en mémoire.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-android}" # android | ios | start
NUKE="${NUKE:-0}"

adb_bin() {
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return
  fi
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  if [[ -x "$sdk/platform-tools/adb" ]]; then
    echo "$sdk/platform-tools/adb"
    return
  fi
  return 1
}

echo "→ Arrêt Metro / Expo (port 8081)…"
if lsof -ti:8081 >/dev/null 2>&1; then
  lsof -ti:8081 | xargs kill -9 2>/dev/null || true
fi
pkill -f "expo start" 2>/dev/null || true
pkill -f "react-native/cli.js start" 2>/dev/null || true
sleep 0.4

echo "→ Cache Metro / Expo…"
rm -rf "$ROOT/.expo" "$ROOT/node_modules/.cache"
# caches temp Hermes / Metro (souvent la vraie cause du « pas rebuild »)
rm -rf "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* "${TMPDIR:-/tmp}"/react-* 2>/dev/null || true
if command -v watchman >/dev/null 2>&1; then
  watchman watch-del-all >/dev/null 2>&1 || true
fi

if [[ "$TARGET" == "android" || "$TARGET" == "ios" ]]; then
  if ADB="$(adb_bin)"; then
    if "$ADB" devices 2>/dev/null | grep -qE $'\tdevice$'; then
      echo "→ Force-stop Expo Go Android…"
      "$ADB" shell am force-stop host.exp.exponent >/dev/null 2>&1 || true
      if [[ "$NUKE" == "1" ]]; then
        echo "→ Reset data Expo Go Android (NUKE=1)…"
        "$ADB" shell pm clear host.exp.exponent >/dev/null 2>&1 || true
      fi
    else
      echo "⚠ Aucun émulateur/device Android 'device'. Lance Android Studio / emulator d’abord."
    fi
  else
    echo "⚠ adb introuvable — impossible de tuer Expo Go Android."
  fi
fi

if [[ "$TARGET" == "ios" ]] && command -v xcrun >/dev/null 2>&1; then
  echo "→ Force-stop Expo Go iOS sim…"
  xcrun simctl terminate booted host.exp.Exponent >/dev/null 2>&1 || true
fi

echo "→ expo start -c (${TARGET})…"
if [[ "$TARGET" == "android" ]]; then
  exec npx expo start -c --android
elif [[ "$TARGET" == "ios" ]]; then
  exec npx expo start -c --ios
else
  exec npx expo start -c
fi

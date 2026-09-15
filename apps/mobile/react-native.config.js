/**
 * Empêche l’autolinking iOS de modules Android-only liés à la MAJ APK.
 * (évite crash dyld ExpoFileSystem / IntentLauncher côté iOS)
 */
module.exports = {
  dependencies: {
    'expo-file-system': {
      platforms: {
        ios: null,
      },
    },
    'expo-intent-launcher': {
      platforms: {
        ios: null,
      },
    },
  },
};

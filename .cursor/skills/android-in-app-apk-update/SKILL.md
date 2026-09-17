---
name: android-in-app-apk-update
description: >-
  Implements in-app Android APK download and install (one tap, progress bar,
  then the system Install dialog). Use when the user asks for Android in-app
  update, mise à jour APK dans l'application, auto-update hors Play Store,
  REQUEST_INSTALL_PACKAGES, latest.json GCS updater, or to replace a browser
  download link with an in-app updater. Android only — never iOS.
---

# Android in-app APK update

Quand l’utilisateur demande une mise à jour Android **dans l’app** (un bouton,
pas un lien de fichier), implémenter **exactement** ce flux. Ne pas ouvrir le
navigateur. Ne pas porter ça sur iOS.

## Produit (non négociable)

1. L’app **Release Android** lit un manifeste HTTPS `latest.json`.
2. Si `versionCode` distant > installé → modal dans l’app.
3. Bouton **Mettre à jour** → téléchargement **dans l’app** + barre de progression.
4. Lancer l’installateur via `content://` (FileProvider).
5. Android affiche **Installer ?** — un tap utilisateur. On ne peut pas le retirer
   (hors Play Store / MDM).
6. Première fois : si bloqué, ouvrir `MANAGE_UNKNOWN_APP_SOURCES` pour **ce** package,
   puis relancer l’install au retour dans l’app.

**Interdit :** `Linking.openURL(apkUrl)`, WebView de téléchargement, iOS, Expo Go /
`__DEV__`, install silencieuse.

## Dépendances Expo

```bash
npx expo install expo-file-system expo-intent-launcher
```

## Manifeste `latest.json`

```json
{
  "version": "1.2.0",
  "versionCode": 12,
  "apkUrl": "https://storage.googleapis.com/<bucket>/installers/mobile/android/App-1.2.0-12.apk",
  "sha256": "<64 hex>",
  "size": 12345678,
  "publishedAt": "2026-01-01T00:00:00.000Z",
  "notes": "Texte court",
  "mandatory": false
}
```

- `apkUrl` : HTTPS uniquement, même host de confiance que le manifeste, suffixe `.apk`.
- Publier APK **et** `latest.json` ensemble. Cache : APK immutable ; `latest.json` `no-store`.
- Bump **`android.versionCode`** (et `version`) à chaque release. Même **keystore**.

## Native Android

Permission : `android.permission.REQUEST_INSTALL_PACKAGES`.

Queries (Android 11+) :

```xml
<queries>
  <intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:mimeType="application/vnd.android.package-archive" />
  </intent>
</queries>
```

Plugin Expo `withAndroidManifest` + `AndroidConfig.Permissions.withPermissions`.
Ajouter `expo-file-system` aux plugins (FileProvider).

## JS — téléchargement + install

Utiliser `expo-file-system/legacy` (`createDownloadResumable`, `getContentUriAsync`).

```ts
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456;
const dest = `${FileSystem.cacheDirectory}pending-update.apk`;

await FileSystem.deleteAsync(dest, { idempotent: true });
const task = FileSystem.createDownloadResumable(manifest.apkUrl, dest, {}, (p) => {
  const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : manifest.size;
  onProgress(p.totalBytesWritten / total);
});
const result = await task.downloadAsync();
const info = await FileSystem.getInfoAsync(result.uri);
if (!info.exists || info.size !== manifest.size) throw new Error('APK incomplet');

const contentUri = await FileSystem.getContentUriAsync(result.uri);
await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
  data: contentUri,
  type: 'application/vnd.android.package-archive',
  flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
});
```

Sources inconnues (Android 8+) :

```ts
await IntentLauncher.startActivityAsync(
  IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
  { data: `package:${applicationId}` },
);
```

Au retour `AppState === 'active'`, relancer `getContentUriAsync` + VIEW si le fichier est encore là.

`checkForUpdate` : `Platform.OS !== 'android' || __DEV__` → `null`.

**iOS :** ne jamais autolinker `expo-file-system` / `expo-intent-launcher`. Le XCFramework FileSystem crash au dyld (`BaseModule.willDestroy` manquant). Exclure via `expo.autolinking.ios.exclude` + `react-native.config.js` (`platforms.ios: null`). UI : `AndroidUpdatePrompt.android.tsx` + stub iOS.

## UI

Modal dans l’app (pas seulement `Alert.alert`) :

- Titre + version + notes
- **Mettre à jour** / **Plus tard** (masquer Plus tard si `mandatory`)
- Pendant le download : barre + pourcentage
- Puis : « Ouverture de l’installateur Android… »
- Erreur sources inconnues : bouton **Autoriser l’installation**

Vérifier au lancement et au retour au premier plan (throttle ~6 h).

## Référence Shekinah SchoolMatrix

Implémentation :

- `apps/mobile/src/lib/appUpdate.ts`
- `apps/mobile/src/context/UpdateContext.tsx`
- `apps/mobile/src/components/UpdateBanner.tsx` (`UpdatePrompt` + bannières)
- `apps/mobile/package.json` → `expo.autolinking.ios.exclude`
- `apps/mobile/react-native.config.js`
- `apps/mobile/plugins/with-android-apk-install.js`
- Upload : `infra/scripts/upload-mobile-apk.ps1` / `.sh` / `ship-mobile.sh`
- Bucket : `shekinah-schoolmatrix-assets` uniquement
- Feed : `https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/mobile/latest.json`

Canonique d’origine : POS Entreprises Israel (même skill). Pour un autre tenant :
changer `UPDATE` / package / keystore / bucket.

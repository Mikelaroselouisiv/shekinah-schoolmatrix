# Shekinah — App mobile

Frontend React Native (Expo) pour Android & iOS.

**Marque :** Shekinah (pas « Parallele » dans l’UI).

## Démarrer

```bash
# depuis la racine du monorepo
npm run dev:mobile

# ou
npm --prefix apps/mobile start
```

Puis scanner le QR code avec Expo Go, ou `i` / `a` pour simulateur.

### Les changements UI ne s’affichent pas ?

`npx expo start -c` puis `a` **ne rebuild pas** Expo Go. `-c` vide seulement le cache Metro sur le Mac. L’app Android/iOS garde souvent l’ancien JS en mémoire.

Pour un vrai relance Android :

```bash
# depuis la racine du monorepo
npm run dev:mobile:android:fresh

# depuis apps/mobile (même commande, alias ajouté)
npm run android:fresh
# ou
npm run dev:mobile:android:fresh
```

Ça : tue le port 8081, vide Metro/`.expo`, **force-stop Expo Go** sur l’émulateur, puis `expo start -c --android`.

Si ça reste collé (très rare) :

```bash
NUKE=1 npm --prefix apps/mobile run android:fresh
```

(`pm clear` Expo Go — tu devras te reconnecter à Expo.)

**Ce que `-c` ne peut pas changer :** splash, icône, plugins natifs (`app.json`) → il faut un build natif (`eas build` / prebuild), pas Expo Go.

### API

Par défaut → **cloud** `http://34.118.138.96` (comme desktop Remote).  
Override : `EXPO_PUBLIC_API_BASE_URL` ou `EXPO_PUBLIC_API_TARGET=local|cloud` (voir `.env.example`).  
Les builds EAS injectent l’URL cloud (`eas.json`). HTTP cleartext / ATS sont autorisés dans `app.json` (API cloud en HTTP).

```bash
# Nest local (iOS sim)
EXPO_PUBLIC_API_TARGET=local npm run dev:mobile

# ou URL explicite — voir .env.example
```

### Clavier

`react-native-keyboard-controller` + `KeyboardProvider` ; helpers `FormScrollView` / `FormModal`.  
Android : `softwareKeyboardLayoutMode: "resize"`. Rebuild natif requis après changement de config.

### Build APK (preview) + login cloud

```bash
cd apps/mobile
npx eas-cli build -p android --profile preview
```

Installer l’APK, se connecter → API `http://34.118.138.96`.

### Publier une MAJ APK (feed GCS)

Équivalent desktop `electron-updater` : feed  
`https://storage.googleapis.com/shekinah-schoolmatrix-assets/installers/mobile/latest.json`

```powershell
# Depuis la racine du monorepo (bump + EAS wait + download artifact + upload GCS)
powershell -ExecutionPolicy Bypass -File infra/scripts/ship-mobile.ps1 -Bump patch

# Upload seul d’un APK déjà construit
powershell -ExecutionPolicy Bypass -File infra/scripts/upload-mobile-apk.ps1 -ApkPath ./apps/mobile/dist/app.apk
```

Sur **Android Release**, l’app affiche une modal : **Mettre à jour** télécharge l’APK **dans l’app** (barre de progression), puis ouvre l’installateur système. Pas de navigateur.  
iOS : pas de MAJ APK in-app.

**Première fois** : installer un APK qui contient déjà le checker ; les ships suivants notifient les appareils.

## Spec produit

| Fichier | Contenu |
|---------|---------|
| [`docs/CARTOGRAPHIE.md`](docs/CARTOGRAPHIE.md) | Inventaire desktop + backend |
| [`docs/PLAN-UI-UX.md`](docs/PLAN-UI-UX.md) | Navigation mobile / personas |
| [`docs/PLAN-APPLICATION.md`](docs/PLAN-APPLICATION.md) | Feuille de route S0→S21 |
| [`docs/ROLE_CHECKS.md`](docs/ROLE_CHECKS.md) | Checklist ACL par rôle (S21) |
| [`spec/productMap.ts`](spec/productMap.ts) | Schéma navigation |

Logo : `assets/logo.png`

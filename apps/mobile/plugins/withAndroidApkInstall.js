const {
  withAndroidManifest,
  AndroidConfig,
} = require('expo/config-plugins');

/**
 * Permissions + queries for in-app APK install (REQUEST_INSTALL_PACKAGES).
 */
function withAndroidApkInstall(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.REQUEST_INSTALL_PACKAGES',
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    const already = manifest.queries.some((q) => {
      const intents = q.intent || [];
      return intents.some((intent) => {
        const action = intent.action?.[0]?.$?.['android:name'];
        const mime = intent.data?.[0]?.$?.['android:mimeType'];
        return (
          action === 'android.intent.action.VIEW' &&
          mime === 'application/vnd.android.package-archive'
        );
      });
    });

    if (!already) {
      manifest.queries.push({
        intent: [
          {
            action: [
              {
                $: { 'android:name': 'android.intent.action.VIEW' },
              },
            ],
            data: [
              {
                $: {
                  'android:mimeType':
                    'application/vnd.android.package-archive',
                },
              },
            ],
          },
        ],
      });
    }

    return cfg;
  });

  return config;
}

module.exports = withAndroidApkInstall;

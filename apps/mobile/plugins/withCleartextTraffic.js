const {
  withAndroidManifest,
  AndroidConfig,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Force HTTP cleartext (API cloud Shekinah en http://34.118.138.96).
 * usesCleartextTraffic seul ne suffit pas toujours sur appareils physiques.
 */
function withCleartextTraffic(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resXml = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      );
      fs.mkdirSync(resXml, { recursive: true });
      fs.writeFileSync(
        path.join(resXml, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">34.118.138.96</domain>
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`,
        'utf8',
      );
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const perms = manifest.manifest['uses-permission'];
    const hasInternet = perms.some(
      (p) => p.$?.['android:name'] === 'android.permission.INTERNET',
    );
    if (!hasInternet) {
      perms.push({ $: { 'android:name': 'android.permission.INTERNET' } });
    }
    const hasNetState = perms.some(
      (p) => p.$?.['android:name'] === 'android.permission.ACCESS_NETWORK_STATE',
    );
    if (!hasNetState) {
      perms.push({
        $: { 'android:name': 'android.permission.ACCESS_NETWORK_STATE' },
      });
    }

    return cfg;
  });

  return config;
}

module.exports = withCleartextTraffic;

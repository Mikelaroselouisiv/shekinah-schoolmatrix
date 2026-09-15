const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * CocoaPods lie ExpoModulesJSI (@rpath) mais n'ajoute pas toujours
 * install_framework dans Pods-*-frameworks.sh → crash DYLD au lancement.
 */
function withEmbedExpoModulesJSI(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;

      let podfile = fs.readFileSync(podfilePath, 'utf8');
      const marker = 'withEmbedExpoModulesJSI';
      if (podfile.includes(marker)) return cfg;

      const hook = `
  # ${marker}: force-embed ExpoModulesJSI (missing from CocoaPods frameworks.sh)
  frameworks_sh = File.join(__dir__, 'Pods', 'Target Support Files', 'Pods-SchoolMatrix', 'Pods-SchoolMatrix-frameworks.sh')
  if File.exist?(frameworks_sh)
    contents = File.read(frameworks_sh)
    line = '  install_framework "\${PODS_XCFRAMEWORKS_BUILD_DIR}/ExpoModulesJSI/ExpoModulesJSI.framework"'
    unless contents.include?('ExpoModulesJSI/ExpoModulesJSI.framework')
      contents = contents.gsub(
        /install_framework "\$\{PODS_XCFRAMEWORKS_BUILD_DIR\}\/ExpoModulesCore\/ExpoModulesCore\\.framework"/,
        "\\\\0\\n#{line}"
      )
      File.write(frameworks_sh, contents)
    end
  end
`;

      if (podfile.includes('post_install do |installer|')) {
        podfile = podfile.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|${hook}`,
        );
      } else {
        podfile += `\npost_install do |installer|${hook}\nend\n`;
      }

      fs.writeFileSync(podfilePath, podfile);
      return cfg;
    },
  ]);
}

module.exports = withEmbedExpoModulesJSI;

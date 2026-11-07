// Signs Android release builds with the Play upload key when ~/.gradle/gradle.properties has its
// KUBBO3D_UPLOAD_* entries (path and passwords never live in the repo); otherwise the debug key, as before.
const { withAppBuildGradle } = require('expo/config-plugins');

const CONFIG = `
        // Play upload key: its path and passwords live in ~/.gradle/gradle.properties, never in the repo.
        if (findProperty('KUBBO3D_UPLOAD_STORE_FILE')) {
            release {
                storeFile file(findProperty('KUBBO3D_UPLOAD_STORE_FILE'))
                storePassword findProperty('KUBBO3D_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('KUBBO3D_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('KUBBO3D_UPLOAD_KEY_PASSWORD')
            }
        }`;

module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes('KUBBO3D_UPLOAD_STORE_FILE')) return mod;
    gradle = gradle.replace(/(signingConfigs \{\s*debug \{[^}]*\})/, `$1${CONFIG}`);
    gradle = gradle.replace(
      /(release \{[^{}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig findProperty('KUBBO3D_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    mod.modResults.contents = gradle;
    return mod;
  });

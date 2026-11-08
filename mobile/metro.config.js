// Default Expo config, plus .html as an asset: the 3D tools engine (assets/engine/engine.html) ships inside the app.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('html');

module.exports = config;

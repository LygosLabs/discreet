const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// wallet + bdk-rn are yarn portals to the git submodule — not workspace
// packages, so Metro must watch them explicitly.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, 'wallet'),
  path.resolve(__dirname, 'wallet', 'bdk-rn'),
];

// The bdk-rn submodule's pnpm install leaves a nested react-native (0.79)
// in its node_modules; bundling it would bind bdk-rn to a second
// TurboModuleRegistry that can't see the app's native modules. Force every
// react / react-native request to resolve from the app root instead.
const singletons = ['react', 'react-native'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    singletons.some(
      (s) => moduleName === s || moduleName.startsWith(`${s}/`)
    )
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(__dirname, 'package.json') },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 'wallet-source' resolves the wallet package straight from src/ (no bob
// build needed); viem needs package-exports resolution enabled.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  'wallet-source',
  'react-native',
  'browser',
  'require',
];

module.exports = config;

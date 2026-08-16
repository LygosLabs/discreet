# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Discreet

Peer-to-peer Bitcoin betting with Discreet Log Contracts. Expo (prebuild + dev client — native modules required for `@bennyblader/ddk-rn`; Expo Go will NOT work once DLC deps land).

## Git

- Never commit without explicit permission.
- NEVER add AI attribution anywhere: no "Co-Authored-By: Claude", no "Generated with Claude Code", no Claude-Session trailers, no mention of Claude/Anthropic in commits, PR bodies, code comments, or docs.
- Only stage files explicitly part of the work.

## Networks

Runtime-switchable mainnet/testnet4 (not build-time). Default testnet4; mainnet requires confirm dialog.

## Build setup

Wallet layer = `@lygos/wallet` (LygosLabs/wallet git submodule at `wallet/`): bdk-rn (coins) + ddk-rn (DLC). bdk-rn is a nested submodule built from source (`just install`, needs rust/pnpm/yarn/just; first build compiles Rust for minutes). Yarn 4 `portal:` links — npm will not work.

- `just install` → pull submodules + apply `patches/` + build bdk-rn + yarn install
- `npx expo prebuild -p ios && npx expo run:ios` → dev client
- `patches/` carries codegen fixes the submodules need under RN 0.86 (`codegenConfig.ios.modules`); upstream to LygosLabs/wallet and bitcoindevkit/bdk-rn, delete when merged
- Metro (`metro.config.js`) must keep: `wallet-source` condition, watchFolders for the submodules, and the react/react-native singleton redirect (bdk-rn's nested node_modules ships its own react-native — bundling it breaks TurboModule lookup)

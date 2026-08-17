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
## Patches (all applied by `just apply-patches`, so `just install` covers it)

- `bdk-rn/patches/bdk-ffi-async-sync-*.patch` — **bdk-rn's own**, not ours. Without them bdk-ffi builds the *blocking* esplora client and every scan runs HTTP on the JS thread (the app freezes solid). Upstream applies them via their `just submodule-apply-patch`; we apply the same files directly, because theirs starts with `git reset --hard` and would wipe our additive patch.
- `patches/bdk-ffi-esplora-async-extra.patch` — ours: the four methods upstream left synchronous that the wallet calls on every sync (`broadcast`, `get_fee_estimates`, `get_tx_info`, `get_output_status` — the last two run twice per open contract). Same `run_async` + `spawn_blocking` idiom. Upstream to bdk-rn.
- `patches/wallet-esplora-await.patch` — awaits the now-async calls in `LygosWallet`, plus `getReceiveAddress`/`peekAddress`/`revealTo`/`revealedIndex`, per-call `stopGap`, and applying our own broadcast locally. Upstream to LygosLabs/wallet.
- `patches/*-ios-codegen.patch` — `codegenConfig.ios.modules` for RN 0.86's provider map.

Any change to a submodule means regenerating its patch. After a Rust-level change: `just apply-patches && cd wallet/bdk-rn && pnpm ubrn:ios && pnpm prepare`, then rebuild the dev client (the xcframework changed — a JS reload is not enough).

## Chain-scan rules

- Scans stay off the JS thread only while the async patches are applied. `src/lib/wallet-context.tsx` logs `js ticks n/m` on every scan: `n ≈ m` is healthy, `n ≈ 0` means the patches are missing.
- `fullScan` stops after `stopGap` consecutive *unused* addresses, so a payment past the gap is invisible. Never show an address from `revealNextAddress` on a screen that re-renders — use `getReceiveAddress()` (`nextUnusedAddress`). Gap is measured from the recorded last-active index, never guessed.
- `src/lib/esplora.ts` is plain `fetch` for "did I get paid / did it confirm" — cheap, non-blocking, and never writes into the balance (bdk is the authority).

- Metro (`metro.config.js`) must keep: `wallet-source` condition, watchFolders for the submodules, and the react/react-native singleton redirect (bdk-rn's nested node_modules ships its own react-native — bundling it breaks TurboModule lookup)

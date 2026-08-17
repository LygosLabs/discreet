set shell := ["bash", "-euo", "pipefail", "-c"]

[doc("Default command; list all available commands.")]
@list:
    just --list --unsorted

[doc("Full setup: pull the wallet + bdk-rn submodules, build bdk-rn for the target (ios|android|all), and link the workspace.")]
install target="ios": pull (bdk-build target) link

[doc("Init the wallet submodule and its nested bdk-rn (+ bdk-ffi) submodules on their pinned commits, then apply local patches.")]
pull:
    git submodule sync --recursive
    git submodule update --init --recursive wallet
    just apply-patches

[doc("Apply every patch the submodules need (no-ops if already applied): RN 0.86 codegen fixes, bdk-rn's own async-esplora patches, and our additive ones.")]
apply-patches:
    cd wallet && { git apply --reverse --check ../patches/wallet-ios-codegen.patch 2>/dev/null || git apply ../patches/wallet-ios-codegen.patch; }
    cd wallet/bdk-rn && { git apply --reverse --check ../../patches/bdk-rn-ios-codegen.patch 2>/dev/null || git apply ../../patches/bdk-rn-ios-codegen.patch; }
    # bdk-rn ships these against its own pinned bdk-ffi — without them esplora is
    # the blocking client and every scan freezes the JS thread. Upstream applies
    # them via `just submodule-apply-patch`, which we can't use: it starts with
    # `git reset --hard` and would wipe the additive patch below.
    cd wallet/bdk-rn/bdk-ffi && for p in cargo lib esplora electrum; do \
        git apply --reverse --check -C1 "../patches/bdk-ffi-async-sync-$p.patch" 2>/dev/null \
        || git apply -C1 "../patches/bdk-ffi-async-sync-$p.patch"; \
    done
    # ours: the four methods upstream left synchronous that LygosWallet calls
    # on every sync (broadcast, fee estimates, and 2x per open contract).
    cd wallet/bdk-rn/bdk-ffi && { git apply --reverse --check -C1 ../../../patches/bdk-ffi-esplora-async-extra.patch 2>/dev/null || git apply -C1 ../../../patches/bdk-ffi-esplora-async-extra.patch; }
    cd wallet && { git apply --reverse --check ../patches/wallet-esplora-await.patch 2>/dev/null || git apply ../patches/wallet-esplora-await.patch; }

[doc("Build bdk-rn inside the wallet submodule: JS deps, Rust targets, native bindings, TS lib.")]
bdk-build target="ios":
    cd wallet/bdk-rn && pnpm install --ignore-scripts
    {{ if target == "ios" { "rustup target add aarch64-apple-ios aarch64-apple-ios-sim" } else if target == "android" { "rustup target add aarch64-linux-android" } else { "rustup target add aarch64-apple-ios aarch64-apple-ios-sim aarch64-linux-android" } }}
    cd wallet/bdk-rn && {{ if target == "all" { "pnpm ubrn:ios && pnpm ubrn:android" } else { "pnpm ubrn:" + target } }}
    cd wallet/bdk-rn && pnpm prepare

[doc("Install the yarn workspace; the portal: entries link wallet and bdk-rn in.")]
link:
    yarn install

[doc("Check that the tools the build needs are on the PATH.")]
check:
    @for tool in git node yarn pnpm cargo rustup just; do \
        command -v "$tool" >/dev/null || { echo "MISSING: $tool"; exit 1; }; \
    done; echo "All tools found."

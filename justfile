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

[doc("Apply the codegen patches the submodules need under RN 0.86 (no-ops if already applied). Upstream: LygosLabs/wallet + bitcoindevkit/bdk-rn.")]
apply-patches:
    cd wallet && { git apply --reverse --check ../patches/wallet-ios-codegen.patch 2>/dev/null || git apply ../patches/wallet-ios-codegen.patch; }
    cd wallet/bdk-rn && { git apply --reverse --check ../../patches/bdk-rn-ios-codegen.patch 2>/dev/null || git apply ../../patches/bdk-rn-ios-codegen.patch; }

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

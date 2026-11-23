# CLinks desktop

The Tauri 2 shell bundles the static web workspace. Install the Tauri platform prerequisites and Rust, then run `pnpm --filter @clinks/desktop desktop:build --debug --no-bundle` from the repository root to build a local executable. The default bundle opens the standalone demo.

For a connected release, supply a Tauri config override using `--config` and set `app.windows[0].url` to the deployed HTTPS workspace under the same site as the API. This preserves the browser refresh cookie's same-site boundary. The window has no privileged native capabilities. Verify persistent storage and offline behaviour on each target webview. The native PowerSync Tauri plugin, platform signing and distribution remain separate release steps.

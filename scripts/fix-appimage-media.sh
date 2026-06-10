#!/usr/bin/env bash
# Strip bundled GStreamer core libs from the AppImage and repack.
#
# linuxdeploy copies libgstreamer*/libgst* because WebKitGTK links them,
# but mixing the bundled core with the host's plugins breaks device
# enumeration (microphone/camera invisible -> calls and voice fail).
# Removing them makes WebKit use the host's complete GStreamer stack.
set -euo pipefail

bundle_dir="$(readlink -f "$(dirname "$0")/../src-tauri/target/release/bundle/appimage")"
appdir="$bundle_dir/Pulse.AppDir"
plugin="$HOME/.cache/tauri/linuxdeploy-plugin-appimage.AppImage"

[ -d "$appdir" ] || { echo "AppDir not found: $appdir"; exit 1; }

rm -f "$appdir"/usr/lib/libgst*

cd "$bundle_dir"
OUTPUT="Pulse_1.0.0_amd64.AppImage" "$plugin" --appdir "$appdir"
echo "Repacked: $bundle_dir/Pulse_1.0.0_amd64.AppImage"

#!/bin/bash

# Generate latest.json for Tauri updater

set -e

REPO="gravelBridge/Trellico"
BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle/macos"

# Get version from tauri.conf.json
VERSION=$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | head -1 | cut -d'"' -f4)

# Read signature
SIGNATURE=$(cat "$BUNDLE_DIR/Trellico.app.tar.gz.sig")

# Generate latest.json
cat > "$BUNDLE_DIR/latest.json" << EOF
{
  "version": "$VERSION",
  "platforms": {
    "darwin-universal": {
      "url": "https://github.com/$REPO/releases/download/v$VERSION/Trellico.app.tar.gz",
      "signature": "$SIGNATURE"
    },
    "darwin-aarch64": {
      "url": "https://github.com/$REPO/releases/download/v$VERSION/Trellico.app.tar.gz",
      "signature": "$SIGNATURE"
    },
    "darwin-x86_64": {
      "url": "https://github.com/$REPO/releases/download/v$VERSION/Trellico.app.tar.gz",
      "signature": "$SIGNATURE"
    }
  }
}
EOF

echo "Generated $BUNDLE_DIR/latest.json for v$VERSION"

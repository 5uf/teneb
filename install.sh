#!/usr/bin/env bash
# Teneb one-line installer.
# Usage: curl -fsSL https://raw.githubusercontent.com/5uf/teneb/main/install.sh | bash

set -euo pipefail

REPO="${TENEB_REPO:-5uf/teneb}"
BRANCH="${TENEB_BRANCH:-main}"
TARGET="${TENEB_TARGET:-$PWD}"

echo "Teneb installer"
echo "  repo:   $REPO"
echo "  branch: $BRANCH"
echo "  target: $TARGET"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node >=20 required (not found)" >&2
  exit 1
fi

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "error: node >=20 required (found $NODE_MAJOR)" >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo ""
echo "Downloading..."
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$TMPDIR"
PKG_DIR=$(find "$TMPDIR" -maxdepth 1 -type d -name 'teneb-*' | head -n1)

if [ -z "$PKG_DIR" ]; then
  echo "error: could not locate extracted package" >&2
  exit 1
fi

echo "Installing into $TARGET..."
cd "$TARGET"
node "$PKG_DIR/src/cli.js" init

echo ""
echo "Done. Restart Claude Code in $TARGET to activate hooks."

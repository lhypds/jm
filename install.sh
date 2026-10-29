#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/jm"

echo "Installing jm CLI..."

if ! command -v node &> /dev/null; then
  echo "node not found — install Node.js first" >&2
  exit 1
fi

# Install pnpm globally if not present
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm@10.33.0
fi

cd "$ROOT"
echo "Installing dependencies..."
# Building the CLI needs devDependencies (tsup), even when NODE_ENV=production.
pnpm install --frozen-lockfile --prod=false

echo "Building CLI..."
pnpm exec tsup cli.ts --format esm --out-dir dist-cli --clean
chmod +x "$ROOT/dist-cli/cli.js"

# Symlink so the CLI keeps resolving kuromoji and its dictionary from this checkout
mkdir -p "$BIN_DIR"
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
  echo "$TARGET exists and is not a symlink — remove it first" >&2
  exit 1
fi
ln -sf "$ROOT/dist-cli/cli.js" "$TARGET"

echo ""
echo "Installed: $TARGET -> $ROOT/dist-cli/cli.js"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo "Note: $BIN_DIR is not in your PATH. Add this to your shell profile:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

echo "Run: jm <file>"

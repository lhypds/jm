#!/bin/bash
set -e

BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/jm"

echo "Uninstalling jm CLI..."

if [ -L "$TARGET" ]; then
  rm "$TARGET"
  echo "Removed $TARGET"
elif [ -e "$TARGET" ]; then
  echo "$TARGET is not a symlink created by install.sh — leaving it alone" >&2
  exit 1
else
  echo "$TARGET not found — nothing to remove"
fi

echo "Uninstalled."

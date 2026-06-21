#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$ROOT_DIR/comment-overlay.zip"
TMP_FILE="$ROOT_DIR/comment-overlay.$$.zip"

cd "$ROOT_DIR/extension"
zip -r "$TMP_FILE" . \
  -x '*.DS_Store' \
  -x '__MACOSX/*' \
  -x 'icon-source.png'

mv "$TMP_FILE" "$OUT_FILE"
echo "Created $OUT_FILE"

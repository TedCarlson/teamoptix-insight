#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT_DIR="$ROOT_DIR/snapshots"

mkdir -p "$SNAPSHOT_DIR"

STAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
REPO_NAME="$(basename "$ROOT_DIR")"
OUT_FILE="$SNAPSHOT_DIR/${REPO_NAME}_snapshot_${STAMP}.zip"

cd "$ROOT_DIR"

zip -r "$OUT_FILE" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x ".git/*" \
  -x "snapshots/*" \
  -x "*.DS_Store" \
  -x "apps/web/.env.local" \
  -x ".env" \
  -x ".env.local" \
  -x ".pnpm-store/*"

echo "Snapshot created:"
echo "$OUT_FILE"

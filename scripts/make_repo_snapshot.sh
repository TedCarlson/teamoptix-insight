#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT_DIR="$ROOT/repo-snapshots"
STAMP="$(date +"%Y%m%d-%H%M%S")"
OUT="$OUT_DIR/teamoptix-insight-snapshot-$STAMP.txt"

mkdir -p "$OUT_DIR"

emit_file() {
  local file="$1"
  local rel="${file#$ROOT/}"

  case "$rel" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.sql|*.css|*.sh)
      echo
      echo "### $rel"
      echo '```'
      sed -n '1,260p' "$file"
      echo '```'
      ;;
  esac
}

{
  echo "# TeamOptix Insight Repo Snapshot"
  echo "# Generated: $(date)"
  echo "# Root: $ROOT"
  echo

  echo "## Git"
  echo '```'
  git -C "$ROOT" status --short || true
  git -C "$ROOT" branch --show-current || true
  git -C "$ROOT" log -1 --oneline || true
  echo '```'
  echo

  echo "## Repo Tree"
  echo '```'
  find "$ROOT" \
    $begin:math:text$ \\
      \-path \"\$ROOT\/\.git\" \-o \\
      \-path \"\$ROOT\/node\_modules\" \-o \\
      \-path \"\$ROOT\/apps\/web\/node\_modules\" \-o \\
      \-path \"\$ROOT\/apps\/web\/\.next\" \-o \\
      \-path \"\$ROOT\/repo\-snapshots\" \-o \\
      \-path \"\$ROOT\/\.vercel\" \-o \\
      \-path \"\$ROOT\/\.turbo\" \-o \\
      \-path \"\$ROOT\/coverage\" \\
    $end:math:text$ -prune -o \
    -type f \
    ! -name ".env" \
    ! -name ".env.*" \
    ! -name "*.tsbuildinfo" \
    ! -name "*.log" \
    ! -name "*.zip" \
    ! -name "*.xlsx" \
    ! -name "*.xls" \
    ! -name "*.csv" \
    ! -name "*.png" \
    ! -name "*.jpg" \
    ! -name "*.jpeg" \
    ! -name "*.pdf" \
    -print \
    | sed "s#^$ROOT/##" \
    | sort
  echo '```'
  echo

  echo "## Key Manifests"
  for f in \
    package.json \
    pnpm-workspace.yaml \
    apps/web/package.json \
    apps/web/tsconfig.json \
    apps/web/eslint.config.mjs \
    apps/web/next.config.ts \
    apps/web/next.config.mjs \
    apps/web/middleware.ts
  do
    if [ -f "$ROOT/$f" ]; then
      emit_file "$ROOT/$f"
    fi
  done

  echo
  echo "## Source Files"
  find "$ROOT/apps/web/src" "$ROOT/docs" "$ROOT/scripts" \
    \( \
      -path "*/node_modules/*" -o \
      -path "*/.next/*" -o \
      -path "*/repo-snapshots/*" \
    \) -prune -o \
    -type f \
    ! -name ".env" \
    ! -name ".env.*" \
    ! -name "*.tsbuildinfo" \
    ! -name "*.map" \
    ! -name "*.log" \
    ! -name "*.zip" \
    ! -name "*.xlsx" \
    ! -name "*.xls" \
    ! -name "*.csv" \
    ! -name "*.png" \
    ! -name "*.jpg" \
    ! -name "*.jpeg" \
    ! -name "*.pdf" \
    -print \
    | sort \
    | while read -r file; do
      emit_file "$file"
    done

} > "$OUT"

echo "Snapshot created:"
echo "$OUT"
wc -c "$OUT"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

DATE="${1:-$(date +%Y%m%d-%H%M%S)}"
OUTDIR="${OUTDIR:-$(dirname "$ROOT")/repo-snapshots/insight}"
WORKDIR="$OUTDIR/repo-snapshot-$DATE"
ZIP="$OUTDIR/teamoptix-insight-repo-$DATE.zip"

rm -rf "$WORKDIR" "$ZIP"
mkdir -p "$WORKDIR"

EXCLUDES=(
  -path "./.git" -o -path "./.git/*" -o
  -path "./repo-snapshots" -o -path "./repo-snapshots/*" -o
  -path "./snapshots" -o -path "./snapshots/*" -o
  -path "./node_modules" -o -path "./node_modules/*" -o
  -path "*/node_modules" -o -path "*/node_modules/*" -o
  -path "*/.next" -o -path "*/.next/*" -o
  -path "*/dist" -o -path "*/dist/*" -o
  -path "*/build" -o -path "*/build/*" -o
  -path "*/out" -o -path "*/out/*" -o
  -path "*/.turbo" -o -path "*/.turbo/*" -o
  -path "*/.vercel" -o -path "*/.vercel/*" -o
  -path "*/coverage" -o -path "*/coverage/*" -o
  -path "*/.cache" -o -path "*/.cache/*"
)

find . \( "${EXCLUDES[@]}" \) -prune -o \
  -type f \
  ! -name ".DS_Store" \
  ! -name ".env" \
  ! -name ".env.*" \
  ! -name ".env*.local" \
  ! -name "*.log" \
  ! -name "*.zip" \
  ! -name "*.xlsx" \
  ! -name "*.xls" \
  ! -name "*.csv" \
  ! -name "*.png" \
  ! -name "*.jpg" \
  ! -name "*.jpeg" \
  ! -name "*.pdf" \
  ! -name "*.tsbuildinfo" \
  ! -name "*.pem" \
  ! -name "*.key" \
  ! -name "*.p12" \
  ! -name "*.pfx" \
  ! -name "*.crt" \
  ! -name "*.cer" \
  ! -name "*.sqlite" \
  ! -name "*.db" \
  -print | sort > "$WORKDIR/file-list.txt"

{
  echo "# TeamOptix Insight Repo Snapshot"
  echo "Generated: $(date)"
  echo "Root: $ROOT"
  echo
  echo "## Git"
  git status --short || true
  echo
  echo "Branch: $(git branch --show-current || true)"
  echo "Last commit: $(git log -1 --oneline || true)"
} > "$WORKDIR/MANIFEST.md"

{
  echo "# Full Repo Tree"
  echo
  sed 's#^\./##' "$WORKDIR/file-list.txt"
} > "$WORKDIR/TREE.md"

# copy files into snapshot folder, preserving paths
while IFS= read -r file; do
  mkdir -p "$WORKDIR/files/$(dirname "${file#./}")"
  cp "$file" "$WORKDIR/files/${file#./}"
done < "$WORKDIR/file-list.txt"

# zip the snapshot folder
(cd "$OUTDIR" && zip -qr "$(basename "$ZIP")" "$(basename "$WORKDIR")")

echo "Created: $ZIP"
ls -lh "$ZIP"

echo
echo "Snapshot contents:"
zipinfo -1 "$ZIP" | awk 'NR <= 80 { print }'

echo
echo "Leak check..."
if zipinfo -1 "$ZIP" | egrep -q '(^|/)\.env|(^|/)node_modules/|(^|/)\.git/|\.pem$|\.key$|\.p12$|\.pfx$|\.sqlite$|\.db$'; then
  echo "ERROR: snapshot may contain sensitive or bulky files."
  zipinfo -1 "$ZIP" | egrep '(^|/)\.env|(^|/)node_modules/|(^|/)\.git/|\.pem$|\.key$|\.p12$|\.pfx$|\.sqlite$|\.db$' | awk 'NR <= 200 { print }'
  exit 1
fi

echo "✅ Leak check passed."

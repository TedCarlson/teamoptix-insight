#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRAPER_DIR="$APP_DIR/storage/app/public/scraper"
PY="$SCRAPER_DIR/.venv/bin/python"
LOCK_FILE="$APP_DIR/runtime/locks/report-runner.lock"
COOLDOWN_FILE="$APP_DIR/runtime/state/login-failure-cooldown.until"
LOG_FILE="$APP_DIR/runtime/logs/run-$(date -u +%Y%m%dT%H%M%SZ).log"

COOLDOWN_SECONDS="${RUNNER_LOGIN_FAILURE_COOLDOWN_SECONDS:-3600}"

mkdir -p "$APP_DIR/runtime/logs" "$APP_DIR/runtime/locks" "$APP_DIR/runtime/state"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "[runner] start $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[runner] app=$APP_DIR"
echo "[runner] log=$LOG_FILE"

if [ -f "$COOLDOWN_FILE" ]; then
  until_epoch="$(cat "$COOLDOWN_FILE" || true)"
  now_epoch="$(date +%s)"
  if [ "${until_epoch:-0}" -gt "$now_epoch" ]; then
    echo "[runner] blocked: login failure cooldown active until epoch $until_epoch"
    exit 20
  fi
fi

if [ -f "$LOCK_FILE" ]; then
  old_pid="$(cat "$LOCK_FILE" || true)"
  if [ -n "${old_pid:-}" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "[runner] blocked: another run is active pid=$old_pid"
    exit 21
  fi
  echo "[runner] stale lock removed"
  rm -f "$LOCK_FILE"
fi

echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

export FCMS_SCRAPER_HOME="$SCRAPER_DIR"

set +e
"$PY" "$SCRAPER_DIR/dynamic_script.py"
status=$?
set -e

echo "[runner] scraper exit status=$status"

if [ "$status" -ne 0 ]; then
  until_epoch="$(($(date +%s) + COOLDOWN_SECONDS))"
  echo "$until_epoch" > "$COOLDOWN_FILE"
  echo "[runner] failure cooldown set for $COOLDOWN_SECONDS seconds"
  exit "$status"
fi

rm -f "$COOLDOWN_FILE"
echo "[runner] complete $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

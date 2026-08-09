#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${INSIGHT_QUEUE_POLL_SECONDS:-60}"

cd "$APP_DIR"

echo "[listener] started $(date -u +"%Y-%m-%dT%H:%M:%SZ") app=$APP_DIR interval=${INTERVAL_SECONDS}s"

while true; do
  echo "[listener] poll $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  set +e
  INSIGHT_RUNNER_DRY_RUN="${INSIGHT_RUNNER_DRY_RUN:-0}" python3 runner/run-insight-request.py
  status=$?
  set -e

  echo "[listener] poll complete status=$status"

  sleep "$INTERVAL_SECONDS"
done

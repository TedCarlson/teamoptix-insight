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

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

export FCMS_DB_HOST="${FCMS_DB_HOST:-${DB_HOST:-127.0.0.1}}"
export FCMS_DB_USER="${FCMS_DB_USER:-${DB_USERNAME:-}}"
export FCMS_DB_PASSWORD="${FCMS_DB_PASSWORD:-${DB_PASSWORD:-}}"
export FCMS_DB_NAME="${FCMS_DB_NAME:-${DB_DATABASE:-fcms}}"

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

overall_status=0
produced_total=0

runner_goal="${FCMS_RUNNER_GOAL:-}"
if [ -z "$runner_goal" ]; then
  case "${FCMS_REQUEST_TYPE:-}" in
    HISTORICAL_BACKFILL) runner_goal="collect_historical_dsw_range" ;;
    PREVIOUS_DAY_CLOSE) runner_goal="collect_previous_day_dsw" ;;
    TARGETED_RECOVERY) runner_goal="collect_targeted_artifacts" ;;
  esac
fi

if [ "$runner_goal" = "collect_historical_dsw_range" ] \
  || [ "$runner_goal" = "collect_previous_day_dsw" ] \
  || [ "$runner_goal" = "collect_targeted_artifacts" ]; then

  HISTORICAL_DATES=()

  if [ "$runner_goal" = "collect_historical_dsw_range" ]; then
    if [ -z "${FCMS_SERVICE_DATE_START:-}" ] || [ -z "${FCMS_SERVICE_DATE_END:-}" ]; then
      echo "[runner] invalid lane contract: historical range requires start and end dates"
      exit 22
    fi

    mapfile -t HISTORICAL_DATES < <(
      FCMS_RANGE_START="$FCMS_SERVICE_DATE_START" \
      FCMS_RANGE_END="$FCMS_SERVICE_DATE_END" \
      python3 - <<'PYDATES'
from datetime import date, timedelta
import os

start = date.fromisoformat(os.environ["FCMS_RANGE_START"])
end = date.fromisoformat(os.environ["FCMS_RANGE_END"])

if end < start:
    raise SystemExit("Historical end date must be on or after start date.")

current = start
while current <= end:
    print(current.isoformat())
    current += timedelta(days=1)
PYDATES
    )
  else
    if [ -z "${FCMS_SERVICE_DATE:-}" ]; then
      echo "[runner] invalid lane contract: $runner_goal requires one exact service date"
      exit 22
    fi
    HISTORICAL_DATES=("$FCMS_SERVICE_DATE")
  fi

  echo "[runner] governed lane goal=$runner_goal request_type=${FCMS_REQUEST_TYPE:-} dates=${HISTORICAL_DATES[*]}"

  for service_date in "${HISTORICAL_DATES[@]}"; do
    before_count="$(find "$SCRAPER_DIR/Excels" -type f -mmin -120 2>/dev/null | wc -l | tr -d ' ')"
    date_started_at="$(date +%s)"

    echo "[runner] governed date start: $service_date"

    set +e
    FCMS_SERVICE_DATE="$service_date" "$PY" "$SCRAPER_DIR/scrape_particular_date.py"
    status=$?
    set -e

    after_count="$(find "$SCRAPER_DIR/Excels" -type f -mmin -120 2>/dev/null | wc -l | tr -d ' ')"
    produced_count="$((after_count - before_count))"
    [ "$produced_count" -lt 0 ] && produced_count=0
    produced_total="$((produced_total + produced_count))"
    elapsed_seconds="$(($(date +%s) - date_started_at))"

    echo "[runner] governed date exit status=$status service_date=$service_date produced_count=$produced_count elapsed_seconds=$elapsed_seconds"

    if [ "$status" -ne 0 ]; then
      overall_status="$status"
      break
    fi
  done

else
  IFS=',' read -ra TARGET_SECTIONS <<< "${FCMS_TARGET_SECTIONS:-}"

  if [ "${#TARGET_SECTIONS[@]}" -eq 0 ] || [ -z "${FCMS_TARGET_SECTIONS:-}" ]; then
    TARGET_SECTIONS=("ALL")
  fi

  if [ "${FCMS_SINGLE_SESSION:-0}" = "1" ]; then
    before_count="$(find "$SCRAPER_DIR/Excels" -type f -mmin -120 2>/dev/null | wc -l | tr -d ' ')"
    session_started_at="$(date +%s)"

    echo "[runner] continuous session start sections=${FCMS_TARGET_SECTIONS:-ALL}"

    set +e
    "$PY" "$SCRAPER_DIR/dynamic_script.py"
    status=$?
    set -e

    after_count="$(find "$SCRAPER_DIR/Excels" -type f -mmin -120 2>/dev/null | wc -l | tr -d ' ')"
    produced_count="$((after_count - before_count))"
    [ "$produced_count" -lt 0 ] && produced_count=0
    produced_total="$((produced_total + produced_count))"
    elapsed_seconds="$(($(date +%s) - session_started_at))"

    echo "[runner] continuous session exit status=$status produced_count=$produced_count elapsed_seconds=$elapsed_seconds"
    overall_status="$status"
  else
  for section in "${TARGET_SECTIONS[@]}"; do
    section="$(echo "$section" | xargs)"
    [ -z "$section" ] && continue

    before_count="$(find "$SCRAPER_DIR/Excels" -type f -mmin -120 2>/dev/null | wc -l | tr -d ' ')"

    echo "[runner] section start: $section"

    set +e
    if [ "$section" = "ALL" ]; then
      "$PY" "$SCRAPER_DIR/dynamic_script.py"
    else
      FCMS_TARGET_SECTIONS="$section" "$PY" "$SCRAPER_DIR/dynamic_script.py"
    fi
    status=$?
    set -e

    after_count="$(find "$SCRAPER_DIR/Excels" -type f -mmin -120 2>/dev/null | wc -l | tr -d ' ')"
    produced_count="$((after_count - before_count))"
    [ "$produced_count" -lt 0 ] && produced_count=0
    produced_total="$((produced_total + produced_count))"

    echo "[runner] section exit status=$status section=$section produced_count=$produced_count"

    if [ "$status" -ne 0 ]; then
      overall_status="$status"
    fi
  done
  fi
fi

echo "[runner] scraper exit status=$overall_status produced_total=$produced_total"

if [ "$overall_status" -ne 0 ]; then
  if [ "${produced_total:-0}" -gt 0 ]; then
    rm -f "$COOLDOWN_FILE"
    echo "[runner] scraper exited nonzero after producing files; cooldown skipped produced_total=$produced_total"
    exit "$overall_status"
  fi

  latest_scraper_log="$(ls -t "$SCRAPER_DIR/Logs"/*.log 2>/dev/null | head -1 || true)"

  if [ -n "$latest_scraper_log" ] && grep -Eqi \
    "Login successfull|Login successful" \
    "$latest_scraper_log"; then
    rm -f "$COOLDOWN_FILE"
    echo "[runner] authenticated scraper failure; login cooldown not set latest_log=$latest_scraper_log"

  elif [ -n "$latest_scraper_log" ] && grep -Eqi \
    "login failed|login failure|authentication failed|invalid credentials|incorrect credentials|invalid username|invalid password|unable to log in|unable to login|credentials rejected" \
    "$latest_scraper_log"; then
    until_epoch="$(($(date +%s) + COOLDOWN_SECONDS))"
    echo "$until_epoch" > "$COOLDOWN_FILE"
    echo "[runner] confirmed login failure; cooldown set for $COOLDOWN_SECONDS seconds latest_log=$latest_scraper_log"

  else
    rm -f "$COOLDOWN_FILE"
    echo "[runner] non-authentication scraper failure; login cooldown not set latest_log=${latest_scraper_log:-none}"
  fi
  exit "$overall_status"
fi

rm -f "$COOLDOWN_FILE"
echo "[runner] complete $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

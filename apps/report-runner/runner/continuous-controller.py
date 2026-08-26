#!/usr/bin/env python3
"""Long-lived, event-programmed controller for Team Optix collection."""

from __future__ import annotations

import json
import hashlib
import hmac
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from zoneinfo import ZoneInfo



APP_DIR = Path(__file__).resolve().parents[1]
INSIGHT_ENV_FILE = Path(
    os.environ.get(
        "INSIGHT_ENV_FILE",
        "/root/teamoptix-insight/apps/automation-worker/.env.production",
    )
)
RUNNER_KEY = os.environ.get("RUNNER_KEY", "vps-laravel-runner-001")
STATE_DIR = Path(
    os.environ.get(
        "CONTINUOUS_RUNNER_STATE_DIR",
        str(APP_DIR / "runtime" / "continuous-runner"),
    )
)
SCHEDULE_FILE = STATE_DIR / "schedule.json"
JOURNAL_FILE = STATE_DIR / "controller-state.json"
CYCLE_RUNNER = APP_DIR / "runner" / "run-continuous-cycle.py"
DONOR_LOCK_FILE = APP_DIR / "runtime" / "locks" / "report-runner.lock"
SHADOW_MODE = os.environ.get("CONTINUOUS_RUNNER_SHADOW", "1") != "0"
CONTROL_PORT = int(os.environ.get("RUNNER_CONTROL_PORT", "8790"))
CONTROL_SECRET = os.environ.get("RUNNER_CONTROL_SECRET", "")


def detect_runner_version() -> str:
    configured = os.environ.get("TEAMOPTIX_RUNNER_VERSION", "").strip()
    if configured:
        return configured
    try:
        revision = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"],
            cwd=str(APP_DIR.parent),
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        ).stdout.strip()
        if revision:
            return revision
    except (OSError, subprocess.SubprocessError):
        pass
    return "unversioned-runner"


RUNNER_VERSION = detect_runner_version()


class CredentialConfigurationError(RuntimeError):
    """A governed credential cannot be used for a FedEx login."""


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def cycle_exit_has_terminal_handoff(returncode: int) -> bool:
    """Whether the child exited normally enough to own terminal reconciliation.

    Negative subprocess return codes mean the operating system terminated the
    child with a signal. In that case the controller must retain active_cycle
    so the replacement process can reconcile the interrupted collection.
    Exit 40 intentionally remains credential-blocked state for the same
    existing restart reconciliation behavior.
    """
    return returncode >= 0 and returncode != 40


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        raise RuntimeError(f"Insight environment file not found: {path}")
    for line in path.read_text(errors="ignore").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


INSIGHT_ENV = load_env_file(INSIGHT_ENV_FILE)
SUPABASE_URL = INSIGHT_ENV.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = INSIGHT_ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")


def rpc(
    name: str,
    payload: dict[str, Any],
    timeout_seconds: int = 45,
) -> Any:
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(
            request, timeout=timeout_seconds
        ) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"RPC {name} failed: HTTP {exc.code} {detail}"
        ) from exc


def atomic_json_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    os.replace(temporary, path)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


class ContinuousController:
    def __init__(self):
        self.stop_event = threading.Event()
        self.lock = threading.RLock()
        self.schedule: dict[str, Any] = read_json(SCHEDULE_FILE)
        self.journal: dict[str, Any] = read_json(JOURNAL_FILE)
        self.credential: dict[str, Any] | None = None
        self.credential_blocked_version: int | None = None
        self.next_retry_at = 0.0
        self.failure_count = 0
        self.last_shadow_log_at = 0.0

    def apply_schedule(
        self,
        value: dict[str, Any],
        acknowledge: bool,
    ) -> None:
        if not isinstance(value, dict):
            raise RuntimeError(
                f"No governed schedule exists for runner {RUNNER_KEY}."
            )
        if value.get("runner_key") != RUNNER_KEY:
            raise RuntimeError("Schedule targets a different runner.")

        with self.lock:
            previous_version = int(
                self.schedule.get("config_version") or 0
            )
            previous_credential_version = int(
                (self.schedule.get("credential") or {}).get("version") or 0
            )
            next_version = int(value.get("config_version") or 0)
            next_credential_version = int(
                (value.get("credential") or {}).get("version") or 0
            )
            self.schedule = value
            atomic_json_write(SCHEDULE_FILE, value)
            if next_credential_version != previous_credential_version:
                self.failure_count = 0
                self.next_retry_at = 0

        print(
            "[controller] schedule applied "
            f"version={next_version} enabled={value.get('collection_enabled')}",
            flush=True,
        )
        if acknowledge and (
            next_version != previous_version
            or not self.journal.get("schedule_acknowledged")
        ):
            rpc(
                "ack_operations_runner_schedule",
                {
                    "p_runner_key": RUNNER_KEY,
                    "p_config_version": next_version,
                    "p_runner_state": (
                        "APPLIED"
                        if value.get("collection_enabled")
                        else "DISABLED"
                    ),
                    "p_runner_error": None,
                    "p_runner_metadata_json": {
                        "runner_version": RUNNER_VERSION,
                        "shadow_mode": SHADOW_MODE,
                        "schedule_transport": "SIGNED_HTTP",
                        "applied_at": utc_iso(),
                    },
                },
            )
            self.journal["schedule_acknowledged"] = True
            self.save_journal()

    def bootstrap_schedule(self, acknowledge: bool) -> None:
        value = rpc(
            "get_operations_runner_bootstrap",
            {"p_runner_key": RUNNER_KEY},
        )
        self.apply_schedule(value, acknowledge)

    def apply_pushed_schedule(
        self, value: dict[str, Any]
    ) -> dict[str, Any]:
        next_version = int(value.get("config_version") or 0)
        with self.lock:
            current_version = int(
                self.schedule.get("config_version") or 0
            )
        if next_version < current_version:
            return {
                "applied": False,
                "reason": "STALE_VERSION",
                "current_version": current_version,
            }
        if next_version == current_version:
            return {
                "applied": True,
                "reason": "ALREADY_APPLIED",
                "current_version": current_version,
            }
        self.apply_schedule(value, acknowledge=True)
        return {
            "applied": True,
            "reason": "APPLIED",
            "current_version": next_version,
        }

    def save_journal(self) -> None:
        self.journal["updated_at"] = utc_iso()
        atomic_json_write(JOURNAL_FILE, self.journal)

    def expected_credential_version(self) -> int:
        return int(
            (self.schedule.get("credential") or {}).get("version") or 0
        )

    def ensure_credential(self) -> dict[str, Any]:
        expected = self.expected_credential_version()
        if (
            self.credential_blocked_version is not None
            and self.credential_blocked_version == expected
        ):
            raise RuntimeError(
                "The current FedEx credential version is blocked after an "
                "authentication rejection."
            )
        cached_version = int(
            (self.credential or {}).get("version") or 0
        )
        if (
            self.credential
            and cached_version == expected
            and self.credential_blocked_version != cached_version
        ):
            username = str(self.credential.get("username") or "").strip()
            if not username.isdigit():
                raise CredentialConfigurationError(
                    "The governed FedEx username is invalid. FedEx user IDs "
                    "must contain digits only; refusing to start a login."
                )
            return self.credential

        known_version = cached_version if self.credential else None
        value = rpc(
            "get_operations_runner_credential",
            {
                "p_runner_key": RUNNER_KEY,
                "p_known_version": known_version,
            },
        )
        if not isinstance(value, dict) or not value.get("available"):
            raise RuntimeError("No usable FedEx credential is available.")

        if value.get("changed"):
            if not value.get("username") or not value.get("password"):
                raise RuntimeError(
                    "Credential version changed without a usable secret."
                )
            username = str(value["username"]).strip()
            if not username.isdigit():
                self.credential = value
                raise CredentialConfigurationError(
                    "The governed FedEx username is invalid. FedEx user IDs "
                    "must contain digits only; refusing to start a login."
                )
            value["username"] = username
            self.credential = value
            self.credential_blocked_version = None
            return value

        if self.credential:
            return self.credential
        raise RuntimeError(
            "Credential response omitted the secret on an empty cache."
        )

    def local_now(self) -> datetime:
        zone_name = str(
            self.schedule.get("timezone") or "America/New_York"
        )
        return datetime.now(ZoneInfo(zone_name))

    @staticmethod
    def parse_clock(value: str) -> tuple[int, int]:
        hour, minute = value[:5].split(":", 1)
        return int(hour), int(minute)

    def within_pulse_window(self, now: datetime) -> bool:
        pulse = self.schedule.get("operations_pulse") or {}
        return self.within_clock_window(
            now,
            str(pulse.get("start_time") or "07:30"),
            str(pulse.get("end_time") or "19:30"),
        )

    def within_clock_window(
        self,
        now: datetime,
        start_time: str,
        end_time: str,
    ) -> bool:
        start_hour, start_minute = self.parse_clock(start_time)
        end_hour, end_minute = self.parse_clock(end_time)
        current = now.hour * 60 + now.minute
        return (
            current >= start_hour * 60 + start_minute
            and current < end_hour * 60 + end_minute
        )

    def route_closeout_config(self) -> dict[str, Any]:
        value = self.schedule.get("route_closeout") or {}
        return value if isinstance(value, dict) else {}

    def within_route_closeout_window(self, now: datetime) -> bool:
        closeout = self.route_closeout_config()
        return self.within_clock_window(
            now,
            str(closeout.get("start_time") or "19:30"),
            str(closeout.get("end_time") or "23:50"),
        )

    def within_route_closeout_final_sweep(self, now: datetime) -> bool:
        closeout = self.route_closeout_config()
        start_hour, start_minute = self.parse_clock(
            str(closeout.get("final_sweep_start_time") or "23:30")
        )
        current = now.hour * 60 + now.minute
        return current >= start_hour * 60 + start_minute

    def route_closeout_cutoff_due(self, now: datetime) -> bool:
        closeout = self.route_closeout_config()
        if not closeout.get("enabled"):
            return False
        end_hour, end_minute = self.parse_clock(
            str(closeout.get("end_time") or "23:50")
        )
        current = now.hour * 60 + now.minute
        completed_date = str(
            self.journal.get("route_closeout_cutoff_date") or ""
        )
        return (
            current >= end_hour * 60 + end_minute
            and completed_date != now.date().isoformat()
        )

    def pulse_operates_today(self, now: datetime) -> bool:
        pulse = self.schedule.get("operations_pulse") or {}
        local_date = now.date().isoformat()
        overrides = pulse.get("operating_date_overrides")
        override = (
            overrides.get(local_date)
            if isinstance(overrides, dict)
            else None
        )
        if override == "OPERATING":
            return True
        if override == "CLOSED":
            return False

        weekdays = pulse.get("operating_weekdays")
        if not isinstance(weekdays, list) or not weekdays:
            return True
        # Existing Insight assignments use JavaScript day numbers:
        # Sunday=0, Monday=1, ... Saturday=6.
        day_number = (now.weekday() + 1) % 7
        return day_number in {
            int(value)
            for value in weekdays
            if str(value).lstrip("-").isdigit()
        }

    def previous_day_close_due(self, now: datetime) -> bool:
        close = self.schedule.get("previous_day_close") or {}
        if not close.get("enabled"):
            return False
        hour, minute = self.parse_clock(
            str(close.get("start_time") or "03:00")
        )
        completed_date = str(self.journal.get("previous_day_close_date") or "")
        return (
            now.hour == hour
            and now.minute == minute
            and completed_date != now.date().isoformat()
        )

    def dro_am_due(self, now: datetime) -> bool:
        dro_am = self.schedule.get("dro_am") or {}
        if not dro_am.get("enabled"):
            return False
        hour, minute = self.parse_clock(
            str(dro_am.get("start_time") or "04:00")
        )
        completed_date = str(self.journal.get("dro_am_date") or "")
        return (
            now.hour == hour
            and now.minute == minute
            and completed_date != now.date().isoformat()
        )

    def start_allowed(self) -> bool:
        return bool(self.schedule.get("collection_enabled"))

    @staticmethod
    def donor_run_active() -> bool:
        """Return true while any governed runner owns the serial donor."""

        try:
            pid = int(
                DONOR_LOCK_FILE.read_text(encoding="utf-8").strip()
            )
            if pid <= 0:
                return False
            os.kill(pid, 0)
            return True
        except (FileNotFoundError, ValueError, ProcessLookupError):
            return False
        except PermissionError:
            return True
        except OSError:
            return False

    def credential_attempt_allowed(self) -> bool:
        return (
            self.credential_blocked_version is None
            or self.credential_blocked_version
            != self.expected_credential_version()
        )

    def reports_for(self, key: str) -> list[str]:
        block = self.schedule.get(key) or {}
        reports = block.get("reports")
        return (
            [str(value).upper() for value in reports]
            if isinstance(reports, list)
            else []
        )

    def journal_interval_due(
        self,
        key: str,
        now: datetime,
        interval_minutes: int,
    ) -> bool:
        value = str(self.journal.get(key) or "").strip()
        if not value:
            return True
        try:
            previous = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if previous.tzinfo is None:
                previous = previous.replace(tzinfo=now.tzinfo)
            return now >= previous.astimezone(now.tzinfo) + timedelta(
                minutes=max(1, interval_minutes)
            )
        except (TypeError, ValueError):
            return True

    def route_closeout_targets(
        self,
        service_date: str,
        final_sweep: bool,
    ) -> list[str]:
        closeout = self.route_closeout_config()
        value = rpc(
            "get_operations_route_closeout_targets",
            {
                "p_company_id": self.schedule["company_id"],
                "p_service_date": service_date,
                "p_limit": int(closeout.get("route_batch_size") or 6),
                "p_final_sweep": final_sweep,
            },
        )
        rows = value if isinstance(value, list) else []
        routes: list[str] = []
        for row in rows:
            route = str(
                row.get("route_key") if isinstance(row, dict) else ""
            ).strip()
            if route and route not in routes:
                routes.append(route)
        return routes

    def route_closeout_reports(
        self,
        now: datetime,
        manifest_routes: list[str],
    ) -> list[str]:
        closeout = self.route_closeout_config()
        reports = self.reports_for("route_closeout") or [
            "FCC",
            "DELIVERY_MANIFEST",
            "PICKUP_MANIFEST",
        ]
        if manifest_routes:
            for required in (
                "FCC",
                "DELIVERY_MANIFEST",
                "PICKUP_MANIFEST",
            ):
                if required not in reports:
                    reports.append(required)
        else:
            reports = [report for report in reports if "MANIFEST" not in report]
            if "FCC" not in reports:
                reports.append("FCC")

        dsw_due = self.journal_interval_due(
            "route_closeout_last_dsw_at",
            now,
            int(closeout.get("dsw_interval_minutes") or 30),
        )
        if dsw_due and "DSW" not in reports:
            reports.insert(0, "DSW")
        return reports

    def route_closeout_source_due(self, now: datetime) -> bool:
        closeout = self.route_closeout_config()
        return self.journal_interval_due(
            "route_closeout_last_fcc_at",
            now,
            int(closeout.get("fcc_interval_minutes") or 10),
        ) or self.journal_interval_due(
            "route_closeout_last_dsw_at",
            now,
            int(closeout.get("dsw_interval_minutes") or 30),
        )

    def run_cycle(
        self,
        request_type: str,
        service_date: str,
        reports: list[str],
        manifest_route_keys: list[str] | None = None,
    ) -> int:
        credential = self.ensure_credential()
        cycle_id = str(uuid.uuid4())
        interrupted = self.journal.get("active_cycle")
        self.journal["active_cycle"] = {
            "cycle_id": cycle_id,
            "request_type": request_type,
            "service_date": service_date,
            "started_at": utc_iso(),
            "replaces_interrupted_cycle": interrupted,
            "manifest_route_keys": manifest_route_keys or [],
        }
        self.save_journal()

        environment = os.environ.copy()
        environment["FCMS_FEDEX_USERNAME"] = str(credential["username"])
        environment["FCMS_FEDEX_PASSWORD"] = str(credential["password"])
        environment["RUNNER_KEY"] = RUNNER_KEY
        environment["TEAMOPTIX_RUNNER_VERSION"] = RUNNER_VERSION
        if interrupted:
            environment["CONTINUOUS_INTERRUPTED_CYCLE_JSON"] = json.dumps(
                interrupted, separators=(",", ":")
            )

        command = [
            sys.executable,
            str(CYCLE_RUNNER),
            "--request-type",
            request_type,
            "--service-date",
            service_date,
            "--terminal-timezone",
            str(self.schedule.get("timezone") or "America/New_York"),
            "--reports-json",
            json.dumps(reports, separators=(",", ":")),
            "--manifest-routes-json",
            json.dumps(manifest_route_keys or [], separators=(",", ":")),
            "--company-id",
            str(self.schedule["company_id"]),
            "--company-slug",
            str(self.schedule["company_slug"]),
            "--runner-key",
            RUNNER_KEY,
            "--config-version",
            str(self.schedule["config_version"]),
            "--cycle-id",
            cycle_id,
        ]
        print(
            "[controller] cycle start "
            f"id={cycle_id} type={request_type} service_date={service_date}",
            flush=True,
        )
        status = subprocess.run(
            command,
            cwd=str(APP_DIR),
            env=environment,
            check=False,
        ).returncode
        print(
            f"[controller] cycle finished id={cycle_id} status={status}",
            flush=True,
        )
        if cycle_exit_has_terminal_handoff(status):
            self.journal["active_cycle"] = None
            self.save_journal()
        return status

    def run_previous_day_manifest_recovery(
        self,
        service_date: str,
    ) -> int:
        closeout = self.route_closeout_config()
        if closeout.get("previous_day_recovery_enabled") is False:
            return 0
        maximum = max(
            1,
            min(
                int(closeout.get("previous_day_recovery_max_batches") or 4),
                10,
            ),
        )
        reports = ["DELIVERY_MANIFEST", "PICKUP_MANIFEST"]
        for _ in range(maximum):
            routes = self.route_closeout_targets(
                service_date,
                final_sweep=True,
            )
            if not routes:
                return 0
            status = self.run_cycle(
                "ROUTE_CLOSEOUT",
                service_date,
                reports,
                manifest_route_keys=routes,
            )
            if status != 0:
                return status
        return 0

    def mark_auth_failure(self) -> None:
        version = int((self.credential or {}).get("version") or 0)
        self.credential_blocked_version = version
        self.credential = None
        self.failure_count += 1
        self.next_retry_at = time.monotonic() + min(
            300 * (2 ** (self.failure_count - 1)), 1800
        )
        try:
            rpc(
                "ack_operations_runner_schedule",
                {
                    "p_runner_key": RUNNER_KEY,
                    "p_config_version": self.schedule["config_version"],
                    "p_runner_state": "ERROR",
                    "p_runner_error": (
                        "FedEx rejected the cached credential. "
                        f"Waiting for credential version {version + 1}."
                    ),
                    "p_runner_metadata_json": {
                        "runner_version": RUNNER_VERSION,
                        "error_at": utc_iso(),
                        "error_classification": "AUTHENTICATION",
                    },
                },
            )
        except Exception as exc:
            print(f"[controller] failed to report auth error: {exc}")

    def mark_transient_failure(self) -> None:
        self.failure_count += 1
        self.next_retry_at = time.monotonic() + min(
            60 * (2 ** (self.failure_count - 1)), 900
        )

    def shadow_observation(
        self, request_type: str, service_date: str, reports: list[str]
    ) -> None:
        if time.monotonic() - self.last_shadow_log_at < 300:
            return
        self.last_shadow_log_at = time.monotonic()
        print(
            "[controller] shadow would start "
            f"type={request_type} service_date={service_date} "
            f"reports={','.join(reports)}",
            flush=True,
        )

    def run(self) -> int:
        self.bootstrap_schedule(acknowledge=True)
        if not CONTROL_SECRET:
            raise RuntimeError("RUNNER_CONTROL_SECRET is not configured.")
        control_server = RunnerControlServer(
            ("0.0.0.0", CONTROL_PORT),
            RunnerControlHandler,
            self,
        )
        control_thread = threading.Thread(
            target=control_server.serve_forever,
            name="runner-control-http",
            daemon=True,
        )
        control_thread.start()
        print(
            f"[controller] signed control listening port={CONTROL_PORT}",
            flush=True,
        )

        try:
            while not self.stop_event.is_set():
                try:
                    now = self.local_now()

                    if not self.start_allowed():
                        self.stop_event.wait(5)
                        continue

                    # Manual recoveries and controller cycles share one donor.
                    # Defer rather than creating an overlapping pulse request
                    # that can only fail the runner lock.
                    if self.donor_run_active():
                        self.stop_event.wait(1)
                        continue

                    if (
                        self.dro_am_due(now)
                        and self.credential_attempt_allowed()
                    ):
                        if SHADOW_MODE:
                            self.shadow_observation(
                                "DRO_AM",
                                now.date().isoformat(),
                                self.reports_for("dro_am") or ["DRO"],
                            )
                        else:
                            status = self.run_cycle(
                                "DRO_AM",
                                now.date().isoformat(),
                                self.reports_for("dro_am") or ["DRO"],
                            )
                            if status == 0:
                                self.journal["dro_am_date"] = (
                                    now.date().isoformat()
                                )
                                self.failure_count = 0
                                self.next_retry_at = 0
                                self.save_journal()
                            elif status == 40:
                                self.mark_auth_failure()
                            else:
                                self.mark_transient_failure()
                        self.stop_event.wait(1)
                        continue

                    if (
                        self.previous_day_close_due(now)
                        and self.credential_attempt_allowed()
                    ):
                        service_date = (
                            now.date() - timedelta(days=1)
                        ).isoformat()
                        reports = self.reports_for("previous_day_close")
                        if SHADOW_MODE:
                            self.shadow_observation(
                                "PREVIOUS_DAY_CLOSE", service_date, reports
                            )
                        else:
                            status = self.run_cycle(
                                "PREVIOUS_DAY_CLOSE",
                                service_date,
                                reports,
                            )
                            if status == 0:
                                self.journal[
                                    "previous_day_close_date"
                                ] = now.date().isoformat()
                                self.failure_count = 0
                                self.next_retry_at = 0
                                self.save_journal()
                                recovery_status = (
                                    self.run_previous_day_manifest_recovery(
                                        service_date
                                    )
                                )
                                if recovery_status == 40:
                                    self.mark_auth_failure()
                                elif recovery_status != 0:
                                    self.mark_transient_failure()
                            elif status == 40:
                                self.mark_auth_failure()
                            else:
                                self.mark_transient_failure()
                        self.stop_event.wait(1)
                        continue

                    closeout = self.route_closeout_config()
                    if (
                        closeout.get("enabled")
                        and self.pulse_operates_today(now)
                        and self.route_closeout_cutoff_due(now)
                    ):
                        if SHADOW_MODE:
                            self.shadow_observation(
                                "ROUTE_CLOSEOUT_CUTOFF",
                                now.date().isoformat(),
                                [],
                            )
                            self.journal[
                                "route_closeout_cutoff_date"
                            ] = now.date().isoformat()
                            self.save_journal()
                        else:
                            result = rpc(
                                "finalize_operations_route_closeout_cutoff",
                                {
                                    "p_company_id": self.schedule[
                                        "company_id"
                                    ],
                                    "p_service_date": now.date().isoformat(),
                                },
                            )
                            print(
                                "[controller] route closeout cutoff "
                                f"result={json.dumps(result, separators=(',', ':'))}",
                                flush=True,
                            )
                            self.journal[
                                "route_closeout_cutoff_date"
                            ] = now.date().isoformat()
                            self.save_journal()
                        self.stop_event.wait(1)
                        continue

                    if (
                        closeout.get("enabled")
                        and self.pulse_operates_today(now)
                        and self.within_route_closeout_window(now)
                        and self.credential_attempt_allowed()
                        and time.monotonic() >= self.next_retry_at
                    ):
                        service_date = now.date().isoformat()
                        if SHADOW_MODE:
                            self.shadow_observation(
                                "ROUTE_CLOSEOUT",
                                service_date,
                                self.reports_for("route_closeout") or [
                                    "FCC",
                                    "DELIVERY_MANIFEST",
                                    "PICKUP_MANIFEST",
                                ],
                            )
                            self.stop_event.wait(5)
                            continue

                        manifest_routes = self.route_closeout_targets(
                            service_date,
                            final_sweep=(
                                self.within_route_closeout_final_sweep(now)
                            ),
                        )
                        if (
                            not manifest_routes
                            and not self.route_closeout_source_due(now)
                        ):
                            self.stop_event.wait(5)
                            continue

                        reports = self.route_closeout_reports(
                            now,
                            manifest_routes,
                        )
                        status = self.run_cycle(
                            "ROUTE_CLOSEOUT",
                            service_date,
                            reports,
                            manifest_route_keys=manifest_routes,
                        )
                        if status == 0:
                            captured_at = utc_iso()
                            if "FCC" in reports:
                                self.journal[
                                    "route_closeout_last_fcc_at"
                                ] = captured_at
                            if "DSW" in reports:
                                self.journal[
                                    "route_closeout_last_dsw_at"
                                ] = captured_at
                            self.failure_count = 0
                            self.next_retry_at = 0
                            self.save_journal()
                        elif status == 40:
                            self.mark_auth_failure()
                        else:
                            self.mark_transient_failure()
                        self.stop_event.wait(1)
                        continue

                    pulse = self.schedule.get("operations_pulse") or {}
                    if (
                        pulse.get("enabled")
                        and self.pulse_operates_today(now)
                        and self.within_pulse_window(now)
                        and self.credential_attempt_allowed()
                        and time.monotonic() >= self.next_retry_at
                    ):
                        reports = self.reports_for("operations_pulse")
                        if SHADOW_MODE:
                            self.shadow_observation(
                                "OPERATIONS_PULSE",
                                now.date().isoformat(),
                                reports,
                            )
                            self.stop_event.wait(5)
                            continue

                        status = self.run_cycle(
                            "OPERATIONS_PULSE",
                            now.date().isoformat(),
                            reports,
                        )
                        if status == 0:
                            self.failure_count = 0
                            self.next_retry_at = 0
                        elif status == 40:
                            self.mark_auth_failure()
                        else:
                            self.mark_transient_failure()
                        # Success chains immediately into the next cycle. This
                        # small yield only allows signals and control events.
                        self.stop_event.wait(1)
                        continue

                    self.stop_event.wait(5)
                except CredentialConfigurationError as exc:
                    print(f"[controller] credential blocked: {exc}", flush=True)
                    self.mark_auth_failure()
                    self.stop_event.wait(5)
                except Exception as exc:
                    print(f"[controller] loop error: {exc}", flush=True)
                    self.mark_transient_failure()
                    self.stop_event.wait(5)
        finally:
            control_server.shutdown()
            control_server.server_close()
            control_thread.join(timeout=10)

        return 0


class RunnerControlServer(ThreadingHTTPServer):
    def __init__(
        self,
        address: tuple[str, int],
        handler: type[BaseHTTPRequestHandler],
        controller: ContinuousController,
    ):
        super().__init__(address, handler)
        self.controller = controller


class RunnerControlHandler(BaseHTTPRequestHandler):
    server: RunnerControlServer

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[controller] control {format % args}", flush=True)

    def send_json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_json(404, {"ok": False, "error": "Not found."})
            return
        self.send_json(
            200,
            {
                "ok": True,
                "service": "teamoptix-continuous-controller",
                "runner_key": RUNNER_KEY,
                "shadow_mode": SHADOW_MODE,
                "config_version": int(
                    self.server.controller.schedule.get(
                        "config_version", 0
                    )
                ),
            },
        )

    def do_POST(self) -> None:
        if self.path != "/control/schedule":
            self.send_json(404, {"ok": False, "error": "Not found."})
            return
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 65536:
            self.send_json(
                400, {"ok": False, "error": "Invalid payload size."}
            )
            return

        body = self.rfile.read(length)
        expected = hmac.new(
            CONTROL_SECRET.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
        supplied = self.headers.get("x-teamoptix-signature", "")
        supplied = supplied.removeprefix("sha256=")
        if not hmac.compare_digest(expected, supplied):
            self.send_json(401, {"ok": False, "error": "Unauthorized."})
            return

        try:
            schedule = json.loads(body)
            if not isinstance(schedule, dict):
                raise ValueError("Schedule must be an object.")
            result = self.server.controller.apply_pushed_schedule(schedule)
            self.send_json(200, {"ok": True, **result})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})


def main() -> int:
    controller = ContinuousController()

    def stop(_signum: int, _frame: Any) -> None:
        controller.stop_event.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(
        "[controller] starting "
        f"runner={RUNNER_KEY} version={RUNNER_VERSION} "
        f"shadow={SHADOW_MODE}",
        flush=True,
    )
    return controller.run()


if __name__ == "__main__":
    raise SystemExit(main())

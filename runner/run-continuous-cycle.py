#!/usr/bin/env python3
"""Execute one schedule-owned collection and submit one terminal receipt."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parents[1]
LEGACY_RUNNER_PATH = APP_DIR / "runner" / "run-insight-request.py"
DONOR_RUNNER = APP_DIR / "runner" / "run-donor-once.sh"


def load_legacy_runner():
    spec = importlib.util.spec_from_file_location(
        "teamoptix_insight_runner",
        LEGACY_RUNNER_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the established Insight runner.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RUNNER = load_legacy_runner()

REPORT_TARGETS: dict[str, dict[str, Any]] = {
    "DSW": {
        "key": "DSW_DAILY_SERVICE",
        "label": "DSW · Daily Service Worksheet",
        "artifact_key": "DSW",
        "report_family_key": "DSW",
        "runner_section": "DAILY_SERVICE",
        "expected_filename_match": [
            "daily service worksheet",
            "PackageLevelDetails",
        ],
    },
    "FCC": {
        "key": "FCC_WORK_AREA_SUMMARY",
        "label": "FCC · Work Area Summary",
        "artifact_key": "WORK_AREA_SUMMARY",
        "report_family_key": "FCC",
        "report_shape_key": "FCC_WORK_AREA_SUMMARY",
        "runner_section": "SERVICE",
        "expected_filename_match": ["ServiceAreaStatus", "SAStatus_"],
    },
    "DELIVERY_MANIFEST": {
        "key": "P_AND_D_DELIVERY_MANIFEST",
        "label": "P&D · Delivery Manifest",
        "artifact_key": "DELIVERY_MANIFEST",
        "report_family_key": "FCC",
        "runner_section": "P_AND_D",
        "expected_filename_match": ["DeliveryManifest"],
    },
    "PICKUP_MANIFEST": {
        "key": "P_AND_D_PICKUP_MANIFEST",
        "label": "P&D · Pickup Manifest",
        "artifact_key": "PICKUP_MANIFEST",
        "report_family_key": "FCC",
        "runner_section": "P_AND_D",
        "expected_filename_match": ["PickupManifest", "PM"],
    },
}

AUTH_FAILURE_PATTERN = re.compile(
    r"login failed|login failure|authentication failed|invalid credentials|"
    r"incorrect credentials|invalid username|invalid password|"
    r"credentials rejected",
    re.IGNORECASE,
)


def utc_iso(epoch: float | None = None) -> str:
    value = epoch if epoch is not None else time.time()
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--request-type",
        required=True,
        choices=["PREVIOUS_DAY_CLOSE", "OPERATIONS_PULSE"],
    )
    parser.add_argument("--service-date")
    parser.add_argument("--reports-json", required=True)
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--company-slug", required=True)
    parser.add_argument("--runner-key", required=True)
    parser.add_argument("--config-version", required=True, type=int)
    parser.add_argument("--cycle-id", required=True)
    return parser.parse_args()


def request_payload(args: argparse.Namespace, reports: list[str]) -> dict[str, Any]:
    targets = [
        REPORT_TARGETS[report]
        for report in reports
        if report in REPORT_TARGETS
    ]
    previous_day = args.request_type == "PREVIOUS_DAY_CLOSE"
    return {
        "payload_contract_version": "operations_collection_v1",
        "source": "continuous_runner",
        "request_origin": "runner_schedule",
        "request_type": args.request_type,
        "date_mode": "YESTERDAY" if previous_day else "TODAY",
        "runner_goal": (
            "collect_previous_day_dsw"
            if previous_day
            else "keep_operations_current"
        ),
        "collect_scope": "+".join(report.lower() for report in reports),
        "execution_mode": "CONTINUOUS_SUCCESS_CHAIN",
        "config_version": args.config_version,
        "targets": targets,
    }


def child_environment(
    args: argparse.Namespace,
    request: dict[str, Any],
) -> dict[str, str]:
    environment = os.environ.copy()
    environment["FCMS_REQUEST_ID"] = request["id"]
    environment["FCMS_COMPANY_ID"] = args.company_id
    environment["FCMS_COMPANY_SLUG"] = args.company_slug
    environment["FCMS_SERVICE_DATE"] = args.service_date or ""
    environment["FCMS_SERVICE_DATE_START"] = ""
    environment["FCMS_SERVICE_DATE_END"] = ""
    environment["FCMS_REQUEST_TYPE"] = args.request_type
    environment["FCMS_RUNNER_GOAL"] = RUNNER.governed_runner_goal(request)
    environment["FCMS_COLLECTION_SCOPE"] = str(
        request["request_payload"].get("collect_scope") or ""
    )
    environment["FCMS_TARGET_SECTIONS"] = ",".join(
        RUNNER.target_runner_sections(request)
    )
    environment["FCMS_TARGET_ARTIFACT_KEYS"] = ",".join(
        sorted(RUNNER.target_artifact_keys(request))
    )
    manifest_options = RUNNER.manifest_runtime_options(request)
    environment["FCMS_MANIFEST_TYPES"] = ",".join(
        manifest_options["manifest_types"]
    )
    environment["FCMS_SKIP_COMBINED"] = (
        "1" if manifest_options["skip_combined"] else "0"
    )
    environment["FCMS_SINGLE_SESSION"] = "1"
    environment["FCMS_PERSIST_BROWSER"] = "1"
    environment["FCMS_CHROME_DEBUGGER_ADDRESS"] = "127.0.0.1:9222"
    continuous_runtime_dir = APP_DIR / "runtime" / "continuous-runner"
    continuous_runtime_dir.mkdir(parents=True, exist_ok=True)
    continuous_runtime_dir.chmod(0o700)
    chrome_profile_dir = continuous_runtime_dir / "chrome-profile"
    chrome_profile_dir.mkdir(parents=True, exist_ok=True)
    chrome_profile_dir.chmod(0o700)
    environment["FCMS_CHROME_PROFILE_DIR"] = str(chrome_profile_dir)
    environment["FCMS_SESSION_COOKIE_FILE"] = str(
        continuous_runtime_dir / "fedex-session.json"
    )
    return environment


def parse_runtime_marker(line: str) -> dict[str, Any] | None:
    marker = line.find("RUNTIME_EVENT ")
    if marker < 0:
        return None
    try:
        value = json.loads(line[marker + len("RUNTIME_EVENT ") :].strip())
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        return None


def execute_donor(
    environment: dict[str, str],
) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], str]:
    stages: list[dict[str, Any]] = []
    lane_timings: list[dict[str, Any]] = []
    lane_started: tuple[str, float] | None = None
    output_tail: list[str] = []

    process = subprocess.Popen(
        [str(DONOR_RUNNER)],
        cwd=str(APP_DIR),
        env=environment,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    assert process.stdout is not None

    for line in process.stdout:
        print(line, end="")
        output_tail.append(line.strip())
        output_tail = output_tail[-80:]

        marker = parse_runtime_marker(line)
        if marker:
            stages.append(marker)

        lane_match = re.search(
            r"\[runner\] (?:section|governed date) start:\s*(.+)$",
            line.strip(),
        )
        if lane_match:
            lane_started = (lane_match.group(1).strip(), time.time())

        if (
            lane_started
            and (
                "[runner] section exit" in line
                or "[runner] governed date exit" in line
            )
        ):
            lane_timings.append(
                {
                    "lane": lane_started[0],
                    "duration_ms": int(
                        (time.time() - lane_started[1]) * 1000
                    ),
                }
            )
            lane_started = None

    return process.wait(), stages, lane_timings, "\n".join(output_tail)


def upload_artifacts(
    request: dict[str, Any],
    run_started_at: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    artifacts = RUNNER.collect_artifacts(request, run_started_at)
    upload_metrics: list[dict[str, Any]] = []

    for artifact in artifacts:
        packaging_started = time.time()
        data = RUNNER.package_artifact_payload(artifact)
        packaging_ms = int((time.time() - packaging_started) * 1000)
        upload_started = time.time()
        RUNNER.upload_artifact_to_storage(artifact, data)
        upload_ms = int((time.time() - upload_started) * 1000)
        artifact["runner_elapsed_ms"] = int(
            (time.time() - run_started_at) * 1000
        )
        upload_metrics.append(
            {
                "artifact_key": artifact.get("artifact_key"),
                "filename": artifact.get("filename"),
                "size_bytes": artifact.get("size_bytes"),
                "packaging_ms": packaging_ms,
                "upload_ms": upload_ms,
            }
        )

    return artifacts, upload_metrics


def terminal_receipt(
    *,
    args: argparse.Namespace,
    request: dict[str, Any],
    started_at: float,
    completed_at: float,
    donor_exit_code: int,
    stages: list[dict[str, Any]],
    lane_timings: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
    upload_metrics: list[dict[str, Any]],
    auth_failure: bool,
) -> dict[str, Any]:
    route_identities = {
        str((artifact.get("header_identity") or {}).get("work_area"))
        for artifact in artifacts
        if (artifact.get("header_identity") or {}).get("work_area")
    }
    artifact_counts = Counter(
        str(artifact.get("artifact_key") or "UNKNOWN")
        for artifact in artifacts
    )
    event_counts = Counter(
        str(stage.get("event_type") or "UNKNOWN") for stage in stages
    )
    auth_completed = event_counts.get("AUTH_COMPLETED", 0)
    session_reused = event_counts.get("SESSION_REUSED", 0)

    receipt = {
        "contract": "operations_runner_terminal_v1",
        "cycle_id": request["id"],
        "request_type": args.request_type,
        "company": {
            "id": args.company_id,
            "slug": args.company_slug,
            "observed_route_count": len(route_identities),
        },
        "schedule": {
            "config_version": args.config_version,
            "trigger": "PREVIOUS_SUCCESS",
        },
        "timing": {
            "started_at": utc_iso(started_at),
            "completed_at": utc_iso(completed_at),
            "end_to_end_ms": int((completed_at - started_at) * 1000),
            "lanes": lane_timings,
            "uploads": upload_metrics,
        },
        "session": {
            "authentication_count": auth_completed,
            "session_reuse_count": session_reused,
            "authentication_failed": auth_failure,
        },
        "output": {
            "artifact_count": len(artifacts),
            "artifact_counts": dict(artifact_counts),
            "total_bytes": sum(
                int(artifact.get("size_bytes") or 0)
                for artifact in artifacts
            ),
            "route_identities": sorted(route_identities),
        },
        "runtime": {
            "donor_exit_code": donor_exit_code,
            "event_counts": dict(event_counts),
            "events": stages,
        },
        "runner": {
            "key": args.runner_key,
            "version": os.environ.get(
                "TEAMOPTIX_RUNNER_VERSION", "continuous-runner-v1"
            ),
        },
    }
    interrupted_value = os.environ.get(
        "CONTINUOUS_INTERRUPTED_CYCLE_JSON", ""
    )
    if interrupted_value:
        try:
            receipt["reconciled_interrupted_cycle"] = json.loads(
                interrupted_value
            )
        except json.JSONDecodeError:
            receipt["reconciled_interrupted_cycle"] = {
                "unparsed": interrupted_value[:1000]
            }
    return receipt


def trigger_ingest(request_id: str) -> None:
    endpoint = RUNNER.INSIGHT_ENV.get("INSIGHT_ARTIFACT_INGEST_URL")
    token = RUNNER.INSIGHT_ENV.get("INSIGHT_ARTIFACT_INGEST_TOKEN")
    if not endpoint or not token:
        print("[continuous-cycle] ingest trigger not configured")
        return

    body = json.dumps({"request_id": request_id}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            print(
                "[continuous-cycle] ingest trigger "
                f"status={response.status}"
            )
    except (urllib.error.URLError, TimeoutError) as exc:
        # The database receipt is authoritative. The existing fallback ingest
        # cron can safely recover this event until its retirement.
        print(f"[continuous-cycle] ingest trigger deferred: {exc}")


def main() -> int:
    args = parse_args()
    reports_value = json.loads(args.reports_json)
    reports = [
        str(value).upper()
        for value in reports_value
        if str(value).upper() in REPORT_TARGETS
    ]
    if not reports:
        raise RuntimeError("At least one supported report is required.")

    cycle_id = str(uuid.UUID(args.cycle_id))
    payload = request_payload(args, reports)
    request = {
        "id": cycle_id,
        "company_id": args.company_id,
        "company_slug": args.company_slug,
        "request_type": args.request_type,
        "service_date": args.service_date,
        "service_date_start": None,
        "service_date_end": None,
        "requested_reports": reports,
        "request_payload": payload,
    }
    environment = child_environment(args, request)

    started_at = time.time()
    donor_exit_code, stages, lane_timings, output_tail = execute_donor(
        environment
    )
    event_types = {
        str(stage.get("event_type") or "")
        for stage in stages
    }
    authentication_attempted = "AUTH_ATTEMPTED" in event_types
    authentication_succeeded = bool(
        {"AUTH_COMPLETED", "SESSION_REUSED"} & event_types
    )
    auth_failure = bool(AUTH_FAILURE_PATTERN.search(output_tail)) or (
        donor_exit_code != 0
        and authentication_attempted
        and not authentication_succeeded
    )

    artifacts: list[dict[str, Any]] = []
    upload_metrics: list[dict[str, Any]] = []
    upload_error: str | None = None
    try:
        artifacts, upload_metrics = upload_artifacts(request, started_at)
    except Exception as exc:
        upload_error = str(exc)

    completed_at = time.time()
    partial = donor_exit_code != 0 and bool(artifacts)
    outcome = (
        "COMPLETE"
        if artifacts and upload_error is None
        else "FAILED"
    )
    error_message = upload_error
    if donor_exit_code != 0:
        donor_error = f"Collector exited with status {donor_exit_code}."
        error_message = (
            f"{donor_error} Partial artifacts were preserved."
            if partial
            else donor_error
        )

    receipt = terminal_receipt(
        args=args,
        request=request,
        started_at=started_at,
        completed_at=completed_at,
        donor_exit_code=donor_exit_code,
        stages=stages,
        lane_timings=lane_timings,
        artifacts=artifacts,
        upload_metrics=upload_metrics,
        auth_failure=auth_failure,
    )
    receipt["outcome"] = outcome
    receipt["partial"] = partial
    if error_message:
        receipt["error"] = {
            "message": error_message,
            "classification": (
                "AUTHENTICATION" if auth_failure else "COLLECTION"
            ),
        }

    terminal = RUNNER.rpc(
        "record_operations_runner_cycle_terminal",
        {
            "p_runner_key": args.runner_key,
            "p_cycle_id": cycle_id,
            "p_request_type": args.request_type,
            "p_service_date": args.service_date,
            "p_started_at": utc_iso(started_at),
            "p_completed_at": utc_iso(completed_at),
            "p_outcome": outcome,
            "p_requested_reports": reports,
            "p_request_payload": payload,
            "p_receipt_json": receipt,
            "p_artifacts_json": artifacts,
            "p_error_message": error_message,
        },
        timeout_seconds=60,
    )
    print(
        json.dumps(
            {
                "event": "continuous_cycle_terminal",
                "cycle_id": cycle_id,
                "outcome": outcome,
                "artifact_count": len(artifacts),
                "request": terminal,
            },
            indent=2,
        )
    )

    if outcome == "COMPLETE":
        trigger_ingest(cycle_id)
        return 0
    if auth_failure:
        return 40
    return donor_exit_code or 1


if __name__ == "__main__":
    raise SystemExit(main())

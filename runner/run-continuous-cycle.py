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
        "expected_filename_match": ["daily service worksheet"],
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

DSW_ALL_CODES_TARGET: dict[str, Any] = {
    "key": "DSW_ALL_STATUS_CODE_PACKAGES",
    "label": "DSW · All Status Code Packages",
    "artifact_key": "DSW_ALL_STATUS_CODE_PACKAGES",
    "report_family_key": "DSW",
    "report_shape_key": "DSW_ALL_STATUS_CODE_PACKAGES",
    "runner_section": "DAILY_SERVICE",
    "expected_filename_match": ["PackageLevelDetails"],
    "optional_when_empty": True,
}

AUTH_FAILURE_PATTERN = re.compile(
    r"login failed|login failure|authentication failed|invalid credentials|"
    r"incorrect credentials|invalid username|invalid password|"
    r"credentials rejected",
    re.IGNORECASE,
)

SENSITIVE_DIAGNOSTIC_PATTERN = re.compile(
    r"(?i)(['\"]?(?:authorization|apikey|api_key|password|passwd|secret|token|cookie)"
    r"['\"]?\s*[:=]\s*)([^,;}]+)"
)
SENSITIVE_QUERY_PATTERN = re.compile(
    r"(?i)([?&](?:apikey|api_key|password|secret|token|code)=)[^&\s]+"
)
EXCEPTION_PATTERN = re.compile(
    r"^(?P<type>[A-Za-z_][\w.]*(?:Error|Exception|Timeout))"
    r"(?::\s*(?P<message>.+))?$"
)

CYCLE_EXCEPTION_EVENT_TYPES = {
    "DOWNLOAD_FAILED",
    "SOURCE_UNAVAILABLE",
    "NEEDS_ATTENTION",
}


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
    targets: list[dict[str, Any]] = []
    for report in reports:
        if report not in REPORT_TARGETS:
            continue
        targets.append(REPORT_TARGETS[report])
        if report == "DSW":
            # All Codes is part of the DSW contract. It remains optional only
            # when the DSW reports zero status-code packages and exposes no
            # drill-down link.
            targets.append(DSW_ALL_CODES_TARGET)
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
    continuous_runtime_dir = APP_DIR / "runtime" / "continuous-runner"
    continuous_runtime_dir.mkdir(parents=True, exist_ok=True)
    continuous_runtime_dir.chmod(0o700)

    force_fresh_browser = (
        os.environ.get("FCMS_FORCE_FRESH_BROWSER", "0")
        .strip()
        .lower()
        in {"1", "true", "yes", "on"}
    )
    environment["FCMS_SINGLE_SESSION"] = "1"
    environment["FCMS_PERSIST_BROWSER"] = (
        "0" if force_fresh_browser else "1"
    )
    environment["FCMS_CHROME_DEBUGGER_ADDRESS"] = "127.0.0.1:9222"
    chrome_profile_dir = (
        continuous_runtime_dir / f"chrome-profile-{request['id']}"
        if force_fresh_browser
        else continuous_runtime_dir / "chrome-profile"
    )
    chrome_profile_dir.mkdir(parents=True, exist_ok=True)
    chrome_profile_dir.chmod(0o700)
    environment["FCMS_CHROME_PROFILE_DIR"] = str(chrome_profile_dir)
    environment["FCMS_SESSION_COOKIE_FILE"] = str(
        (
            continuous_runtime_dir
            / f"fedex-session-{request['id']}.json"
        )
        if force_fresh_browser
        else continuous_runtime_dir / "fedex-session.json"
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


def sanitize_diagnostic_line(line: str) -> str:
    sanitized = SENSITIVE_DIAGNOSTIC_PATTERN.sub(
        r"\1[REDACTED]",
        line.strip(),
    )
    return SENSITIVE_QUERY_PATTERN.sub(r"\1[REDACTED]", sanitized)


def sanitize_diagnostic_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_diagnostic_line(value)
    if isinstance(value, list):
        return [sanitize_diagnostic_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): (
                "[REDACTED]"
                if str(key).lower() in {
                    "authorization",
                    "apikey",
                    "api_key",
                    "password",
                    "passwd",
                    "secret",
                    "token",
                    "cookie",
                }
                else sanitize_diagnostic_value(item)
            )
            for key, item in value.items()
        }
    return value


def failure_evidence(
    *,
    donor_exit_code: int,
    output_tail: str,
    stages: list[dict[str, Any]],
    auth_failure: bool,
    upload_error: str | None,
) -> dict[str, Any] | None:
    if donor_exit_code == 0 and upload_error is None:
        return None

    lines = [
        sanitize_diagnostic_line(line)
        for line in output_tail.splitlines()
        if line.strip()
    ]
    exception_type = None
    technical_message = upload_error
    for line in reversed(lines):
        match = EXCEPTION_PATTERN.match(line)
        if match:
            exception_type = match.group("type")
            technical_message = match.group("message") or line
            break

    combined = "\n".join(lines)
    stage = "UPLOAD" if upload_error else "COLLECTION"
    summary = (
        "The collected files could not be uploaded to the warehouse."
        if upload_error
        else f"The collector stopped with status {donor_exit_code}."
    )

    if auth_failure:
        stage = "AUTHENTICATION"
        summary = "FedEx rejected or did not complete authentication."
    elif (
        "ReadTimeoutError" in combined
        and "HTTPConnectionPool(host='localhost'" in combined
        and "start_session" in combined
    ):
        stage = "BROWSER_STARTUP"
        summary = (
            "Chrome did not complete its local browser-session handshake "
            "before the 120-second timeout."
        )
    elif "Timed out waiting for manifest download" in combined:
        stage = "DOWNLOAD"
        summary = "A requested report download did not finish before timeout."
    elif "collect_dsw_package_status" in combined:
        stage = "DSW_ALL_CODES"
        summary = "The DSW All Status Code Packages drill-down failed."

    marker_failure = next(
        (
            stage_event
            for stage_event in reversed(stages)
            if str(stage_event.get("event_type") or "").upper()
            == "COLLECTION_FAILED"
        ),
        None,
    )
    if marker_failure:
        marker_metadata = marker_failure.get("metadata") or {}
        marker_lane = marker_failure.get("lane_key")
        stage = str(marker_failure.get("stage") or stage)
        exception_type = (
            str(marker_metadata.get("exception_type"))
            if marker_metadata.get("exception_type")
            else exception_type
        )
        technical_message = (
            str(marker_metadata.get("message"))
            if marker_metadata.get("message")
            else technical_message
        )
        summary = (
            f"The collector failed in the {marker_lane} lane."
            if marker_lane
            else summary
        )

    source_logs = []
    for line in lines:
        for pattern in (r"\[runner\] log=(.+)$", r"latest_log=(\S+)"):
            match = re.search(pattern, line)
            if match:
                basename = Path(match.group(1)).name
                if basename and basename not in source_logs:
                    source_logs.append(basename)

    last_event = stages[-1] if stages else None
    excerpt = lines[-40:]
    return {
        "stage": stage,
        "summary": summary,
        "exception_type": exception_type,
        "technical_message": technical_message,
        "last_runtime_event": last_event,
        "source_logs": source_logs,
        "log_excerpt": excerpt,
        "excerpt_truncated": len(lines) > len(excerpt),
        "captured_at": utc_iso(),
    }


def cycle_exception_evidence(
    stages: list[dict[str, Any]],
) -> dict[str, Any] | None:
    exceptions = [
        stage
        for stage in stages
        if str(stage.get("event_type") or "").upper()
        in CYCLE_EXCEPTION_EVENT_TYPES
    ]
    if not exceptions:
        return None

    event_counts = Counter(
        str(stage.get("event_type") or "UNKNOWN").upper()
        for stage in exceptions
    )
    artifact_counts = Counter(
        str(stage.get("artifact_key") or "UNKNOWN").upper()
        for stage in exceptions
    )
    lane_counts = Counter(
        str(stage.get("lane_key") or "UNKNOWN").upper()
        for stage in exceptions
    )
    reason_counts = Counter(
        str((stage.get("metadata") or {}).get("reason") or "UNSPECIFIED").upper()
        for stage in exceptions
    )
    affected_routes = sorted(
        {
            str(stage.get("route_identity")).strip()
            for stage in exceptions
            if str(stage.get("route_identity") or "").strip()
        }
    )

    summary_parts = []
    download_failed_count = event_counts.get("DOWNLOAD_FAILED", 0)
    unavailable_count = event_counts.get("SOURCE_UNAVAILABLE", 0)
    attention_count = event_counts.get("NEEDS_ATTENTION", 0)
    if download_failed_count:
        failed_artifacts = Counter(
            str(stage.get("artifact_key") or "UNKNOWN").upper()
            for stage in exceptions
            if str(stage.get("event_type") or "").upper()
            == "DOWNLOAD_FAILED"
        )
        detail = ", ".join(
            f"{count} {key.replace('_', ' ').title()}"
            for key, count in failed_artifacts.most_common()
        )
        summary_parts.append(
            f"{download_failed_count} requested report "
            + ("download failed" if download_failed_count == 1 else "downloads failed")
            + (f" ({detail})" if detail else "")
        )
    if unavailable_count:
        unavailable_artifacts = Counter(
            str(stage.get("artifact_key") or "UNKNOWN").upper()
            for stage in exceptions
            if str(stage.get("event_type") or "").upper()
            == "SOURCE_UNAVAILABLE"
        )
        detail = ", ".join(
            f"{count} {key.replace('_', ' ').title()}"
            for key, count in unavailable_artifacts.most_common()
        )
        summary_parts.append(
            f"{unavailable_count} requested source exports were unavailable"
            + (f" ({detail})" if detail else "")
        )
    if attention_count:
        attention_reasons = Counter(
            str(
                (stage.get("metadata") or {}).get("reason")
                or "UNSPECIFIED"
            ).upper()
            for stage in exceptions
            if str(stage.get("event_type") or "").upper()
            == "NEEDS_ATTENTION"
        )
        detail = ", ".join(
            f"{count} {reason.replace('_', ' ').title()}"
            for reason, count in attention_reasons.most_common()
        )
        summary_parts.append(
            f"{attention_count} collection "
            + ("lane requires" if attention_count == 1 else "lanes require")
            + " attention"
            + (f" ({detail})" if detail else "")
        )

    return {
        "stage": "SOURCE",
        "summary": "Collection completed with exceptions: "
        + "; ".join(summary_parts)
        + ".",
        "exception_type": None,
        "technical_message": None,
        "last_runtime_event": exceptions[-1],
        "source_logs": [],
        "log_excerpt": [],
        "excerpt_truncated": False,
        "captured_at": utc_iso(),
        "event_counts": dict(event_counts),
        "artifact_counts": dict(artifact_counts),
        "lane_counts": dict(lane_counts),
        "reason_counts": dict(reason_counts),
        "affected_routes": affected_routes,
    }


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
            stages.append(sanitize_diagnostic_value(marker))

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
    diagnostics: dict[str, Any],
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
        "diagnostics": diagnostics,
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
    exception_evidence = cycle_exception_evidence(stages)
    partial = bool(artifacts) and (
        donor_exit_code != 0
        or upload_error is not None
        or exception_evidence is not None
    )
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
    elif exception_evidence:
        error_message = str(exception_evidence["summary"])

    failure = failure_evidence(
        donor_exit_code=donor_exit_code,
        output_tail=output_tail,
        stages=stages,
        auth_failure=auth_failure,
        upload_error=upload_error,
    )
    diagnostic_lines = [
        sanitize_diagnostic_line(line)
        for line in output_tail.splitlines()
        if line.strip()
    ]
    diagnostics = {
        "capture": "BOUNDED_SANITIZED_TAIL",
        "source_logs": failure.get("source_logs", []) if failure else [],
        "log_excerpt": (
            failure["log_excerpt"]
            if failure
            else diagnostic_lines[-8:]
        ),
        "excerpt_truncated": (
            failure["excerpt_truncated"]
            if failure
            else len(diagnostic_lines) > 8
        ),
    }
    if failure:
        stages.append(
            {
                "event_type": "COLLECTION_FAILED",
                "stage": failure["stage"],
                "occurred_at": utc_iso(completed_at),
                "outcome": "FAILED",
                "duration_ms": int((completed_at - started_at) * 1000),
                "metadata": {
                    "summary": failure["summary"],
                    "exception_type": failure["exception_type"],
                    "technical_message": failure["technical_message"],
                },
            }
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
        diagnostics=diagnostics,
    )
    receipt["outcome"] = outcome
    receipt["partial"] = partial
    if exception_evidence:
        receipt["exceptions"] = exception_evidence
    if error_message:
        receipt["error"] = {
            "message": error_message,
            "classification": (
                "AUTHENTICATION" if auth_failure else "COLLECTION"
            ),
            "evidence": failure or exception_evidence,
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

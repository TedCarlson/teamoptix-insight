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

from failure_classification import is_authentication_failure
from direct_ingestion import (
    DirectIngestionClient,
    RUNNER_VERSION as RUNNER_V2_VERSION,
    derive_endpoint as derive_direct_ingest_endpoint,
    enabled as runner_v2_enabled,
)
from local_retention import (
    enforce_local_retention,
    prepare_cycle_spool,
    release_cycle_spool,
)
from runner_log_evidence import RunnerLogEvidence


APP_DIR = Path(__file__).resolve().parents[1]
LEGACY_RUNNER_PATH = APP_DIR / "runner" / "run-insight-request.py"
DONOR_RUNNER = APP_DIR / "runner" / "run-donor-once.sh"
RUNNER_LOG_OUTBOX_DIR = APP_DIR / "runtime" / "runner-log-outbox"


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
SCRAPER_DIR = APP_DIR / "storage" / "app" / "public" / "scraper"
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))
try:
    from gpx_collection import mark_route_gpx_collected
except ImportError:
    mark_route_gpx_collected = None

REPORT_TARGETS: dict[str, dict[str, Any]] = {
    "DRO": {
        "key": "DRO_PACKAGE_DETAIL",
        "label": "DRO · Package Detail",
        "artifact_key": "DRO_PACKAGE_DETAIL",
        "report_family_key": "DRO",
        "report_shape_key": None,
        "report_frame": None,
        "runner_section": "DRO",
        "service_area": os.environ.get(
            "FCMS_DRO_SERVICE_AREA", ""
        ).strip(),
        "business_name": os.environ.get(
            "FCMS_DRO_BUSINESS_NAME", ""
        ).strip(),
        "expected_filename_match": [
            "package_detail",
            "package detail",
            "packagedetail",
        ],
    },
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
        choices=[
            "DRO_AM",
            "PREVIOUS_DAY_CLOSE",
            "OPERATIONS_PULSE",
            "ROUTE_CLOSEOUT",
        ],
    )
    parser.add_argument("--service-date")
    parser.add_argument("--terminal-timezone")
    parser.add_argument("--reports-json", required=True)
    parser.add_argument("--manifest-routes-json", default="[]")
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--company-slug", required=True)
    parser.add_argument("--runner-key", required=True)
    parser.add_argument("--config-version", required=True, type=int)
    parser.add_argument("--cycle-id", required=True)
    return parser.parse_args()


def request_payload(args: argparse.Namespace, reports: list[str]) -> dict[str, Any]:
    manifest_routes_value = json.loads(args.manifest_routes_json)
    manifest_routes = (
        [str(value).strip() for value in manifest_routes_value if str(value).strip()]
        if isinstance(manifest_routes_value, list)
        else []
    )
    targets: list[dict[str, Any]] = []
    for report in reports:
        if report not in REPORT_TARGETS:
            continue
        targets.append(REPORT_TARGETS[report])
        if report == "DSW" and args.request_type != "ROUTE_CLOSEOUT":
            # All Codes is an independent DSW export and the sole source of
            # package code evidence. The runner only looks for its Contract
            # Total footer link; it does not interpret the displayed count.
            targets.append(DSW_ALL_CODES_TARGET)
    previous_day = args.request_type == "PREVIOUS_DAY_CLOSE"
    route_closeout = args.request_type == "ROUTE_CLOSEOUT"
    return {
        "payload_contract_version": "operations_collection_v1",
        "source": "continuous_runner",
        "request_origin": "runner_schedule",
        "request_type": args.request_type,
        "date_mode": (
            "YESTERDAY"
            if previous_day
            else "EXPLICIT"
            if route_closeout
            else "TODAY"
        ),
        "runner_goal": (
            "collect_previous_day_dsw"
            if previous_day
            else "close_unresolved_routes"
            if route_closeout
            else "keep_operations_current"
        ),
        "collect_scope": "+".join(report.lower() for report in reports),
        "execution_mode": (
            "ROUTE_TARGETED_SUCCESS_CHAIN"
            if route_closeout
            else "CONTINUOUS_SUCCESS_CHAIN"
        ),
        "config_version": args.config_version,
        "targets": targets,
        "manifest_route_keys": manifest_routes,
        "manifest_types": ["delivery", "pickup"],
        "skip_combined": True,
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
    environment["FCMS_TERMINAL_TIMEZONE"] = args.terminal_timezone or ""
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
    dro_target = next(
        (
            target
            for target in request["request_payload"]["targets"]
            if str(target.get("runner_section") or "").upper() == "DRO"
        ),
        {},
    )
    environment["FCMS_DRO_SERVICE_AREA"] = str(
        dro_target.get("service_area") or ""
    ).strip()
    environment["FCMS_DRO_BUSINESS_NAME"] = str(
        dro_target.get("business_name") or ""
    ).strip()
    manifest_options = RUNNER.manifest_runtime_options(request)
    environment["FCMS_MANIFEST_TYPES"] = ",".join(
        manifest_options["manifest_types"]
    )
    environment["FCMS_MANIFEST_WORK_AREAS"] = ",".join(
        RUNNER.target_manifest_routes(request)
    )
    environment["FCMS_SKIP_COMBINED"] = (
        "1" if manifest_options["skip_combined"] else "0"
    )
    continuous_runtime_dir = APP_DIR / "runtime" / "continuous-runner"
    continuous_runtime_dir.mkdir(parents=True, exist_ok=True)
    continuous_runtime_dir.chmod(0o700)

    # Preserve the original donor contract: every section starts a clean
    # browser, authenticates with the governed credential, opens its own
    # FedEx application window, collects, and quits. Only downloaded files
    # carry state between DSW, P&D, and Service.
    environment["FCMS_SINGLE_SESSION"] = "0"
    environment["FCMS_PERSIST_BROWSER"] = "0"
    environment["FCMS_FRESH_BROWSER"] = "1"
    environment["FCMS_FORCE_CREDENTIAL_AUTH"] = "1"
    environment["FCMS_WRITE_LOCAL_DATABASE"] = "0"
    scraper_home = str(request.get("_scraper_home") or "").strip()
    if scraper_home:
        environment["FCMS_SCRAPER_WORK_DIR"] = scraper_home
    safe_company = re.sub(
        r"[^a-z0-9_-]+",
        "",
        args.company_slug.lower(),
    ).strip("-_")
    if safe_company:
        try:
            gpx_state_dir = (
                APP_DIR / "runtime" / "state" / "route-gpx" / safe_company
            )
            gpx_state_dir.mkdir(parents=True, exist_ok=True)
            gpx_state_dir.chmod(0o700)
            environment["FCMS_GPX_STATE_DIR"] = str(gpx_state_dir)
            request["_gpx_state_dir"] = str(gpx_state_dir)
        except OSError:
            # State optimization is optional; collection remains authoritative.
            pass
    return environment


def preserve_acknowledged_route_gpx_state(
    request: dict[str, Any],
    artifacts: list[dict[str, Any]],
) -> int:
    state_directory = str(request.get("_gpx_state_dir") or "").strip()
    if not state_directory or mark_route_gpx_collected is None:
        return 0
    preserved = 0
    for artifact in artifacts:
        if str(artifact.get("artifact_key") or "").upper() != "ROUTE_GPX":
            continue
        route_identity = (
            artifact.get("route_identity")
            or (artifact.get("collection_context") or {}).get(
                "selected_work_area"
            )
        )
        service_date = str(
            artifact.get("service_date")
            or request.get("service_date")
            or ""
        )
        mark_route_gpx_collected(
            state_directory,
            route_identity,
            service_date,
            metadata={
                "artifact_id": artifact.get("artifact_id"),
                "handoff_mode": artifact.get("handoff_mode"),
            },
        )
        preserved += 1
    return preserved


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


def diagnostic_level(line: str) -> str:
    normalized = line.lower()
    if any(
        marker in normalized
        for marker in (
            "traceback (most recent call last)",
            "exception:",
            "error:",
            " failed",
            "failure",
        )
    ):
        return "ERROR"
    if any(marker in normalized for marker in (" warning", "warn:", "deferred")):
        return "WARN"
    return "INFO"


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
    log_evidence: RunnerLogEvidence | None = None,
    on_runtime_marker=None,
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

        sanitized_line = sanitize_diagnostic_line(line)
        if log_evidence and sanitized_line:
            log_evidence.append(
                sanitized_line,
                level=diagnostic_level(sanitized_line),
                stream="DONOR",
            )

        marker = parse_runtime_marker(line)
        if marker:
            stages.append(sanitize_diagnostic_value(marker))
            if on_runtime_marker:
                try:
                    on_runtime_marker()
                except Exception as exc:
                    if log_evidence:
                        log_evidence.append(
                            f"Runner 2.0 file handoff scan deferred: {exc}",
                            level="WARN",
                            stream="HANDOFF",
                        )

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
    artifacts: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    artifacts = artifacts or RUNNER.collect_artifacts(request, run_started_at)
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


def open_runner_v2_cycle(
    *,
    args: argparse.Namespace,
    cycle_id: str,
    reports: list[str],
    payload: dict[str, Any],
    started_at: float,
) -> dict[str, Any]:
    return RUNNER.rpc(
        "start_operations_runner_cycle_v2",
        {
            "p_runner_key": args.runner_key,
            "p_cycle_id": cycle_id,
            "p_company_id": args.company_id,
            "p_company_slug": args.company_slug,
            "p_request_type": args.request_type,
            "p_service_date": args.service_date,
            "p_started_at": utc_iso(started_at),
            "p_requested_reports": reports,
            "p_request_payload": payload,
        },
        timeout_seconds=30,
    )


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
        str((artifact.get("collection_context") or {}).get(
            "selected_work_area"
        ))
        for artifact in artifacts
        if (artifact.get("collection_context") or {}).get(
            "selected_work_area"
        )
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
            "version": request.get("_runner_version") or os.environ.get(
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
        "runner_key": args.runner_key,
    }
    delivered_outboxes, deferred_outboxes = RunnerLogEvidence.drain(
        outbox_dir=RUNNER_LOG_OUTBOX_DIR,
        rpc=RUNNER.rpc,
        exclude_cycle_id=cycle_id,
    )
    log_evidence = RunnerLogEvidence(
        outbox_dir=RUNNER_LOG_OUTBOX_DIR,
        runner_key=args.runner_key,
        cycle_id=cycle_id,
        request_type=args.request_type,
        service_date=args.service_date,
        rpc=RUNNER.rpc,
    )
    log_evidence.append(
        "Collection cycle started.",
        stream="CONTINUOUS",
        metadata={
            "company_slug": args.company_slug,
            "request_type": args.request_type,
            "reports": reports,
            "recovered_outboxes": delivered_outboxes,
            "deferred_outboxes": deferred_outboxes,
        },
    )

    retention = enforce_local_retention(APP_DIR)
    log_evidence.append(
        "Local runner retention completed.",
        level="WARN" if retention["errors"] or retention["warnings"] else "INFO",
        stream="RETENTION",
        metadata=retention,
    )
    if retention["deleted_file_count"] or retention["deleted_profile_count"]:
        print(
            "[continuous-cycle] local retention "
            f"files={retention['deleted_file_count']} "
            f"profiles={retention['deleted_profile_count']} "
            f"bytes={retention['deleted_bytes']}"
        )
    if "unacknowledged-spool-cap-exceeded" in retention["warnings"]:
        log_evidence.append(
            "Collection stopped before download because the unacknowledged spool reached its safety cap.",
            level="ERROR",
            stream="RETENTION",
            metadata=retention,
        )
        log_evidence.flush()
        raise RuntimeError(
            "Runner unacknowledged spool capacity exceeded; collection paused safely."
        )

    cycle_spool = prepare_cycle_spool(APP_DIR, args.company_slug, cycle_id)
    request["_scraper_home"] = str(cycle_spool)
    environment = child_environment(args, request)

    started_at = time.time()
    v2_requested = runner_v2_enabled(
        os.environ.get("TEAMOPTIX_RUNNER_V2_ENABLED")
        or RUNNER.INSIGHT_ENV.get("TEAMOPTIX_RUNNER_V2_ENABLED")
    )
    direct_endpoint = derive_direct_ingest_endpoint(
        RUNNER.INSIGHT_ENV.get("INSIGHT_DIRECT_ARTIFACT_INGEST_URL"),
        RUNNER.INSIGHT_ENV.get("INSIGHT_ARTIFACT_INGEST_URL"),
    )
    direct_token = RUNNER.INSIGHT_ENV.get("INSIGHT_ARTIFACT_INGEST_TOKEN")
    v2_active = False
    direct_client: DirectIngestionClient | None = None
    if v2_requested and direct_endpoint and direct_token:
        try:
            open_runner_v2_cycle(
                args=args,
                cycle_id=cycle_id,
                reports=reports,
                payload={
                    **payload,
                    "payload_contract_version": "operations_collection_v2",
                },
                started_at=started_at,
            )
            direct_client = DirectIngestionClient(
                direct_endpoint,
                direct_token,
                timeout_seconds=25,
            )
            v2_active = True
            request["_runner_version"] = RUNNER_V2_VERSION
            log_evidence.append(
                "Runner 2.0 direct-ingestion cycle opened.",
                stream="HANDOFF",
                metadata={
                    "handoff_contract": "operations_artifact_handoff_v2",
                    "fallback": "STORAGE_WORKER",
                },
            )
        except Exception as exc:
            log_evidence.append(
                f"Runner 2.0 activation failed; using legacy handoff: {exc}",
                level="WARN",
                stream="HANDOFF",
            )
    elif v2_requested:
        log_evidence.append(
            "Runner 2.0 requested but direct-ingestion endpoint is not configured; using legacy handoff.",
            level="WARN",
            stream="HANDOFF",
        )

    v2_artifacts: dict[str, dict[str, Any]] = {}
    v2_handoff_metrics: list[dict[str, Any]] = []

    def handoff_completed_files() -> None:
        if not v2_active or direct_client is None:
            return
        for discovered in RUNNER.collect_artifacts(request, started_at):
            artifact = RUNNER.prepare_transport_artifact(request, discovered)
            artifact_id = str(artifact["artifact_id"])
            if artifact_id in v2_artifacts:
                continue

            handoff_started = time.time()
            data = RUNNER.package_artifact_payload(artifact)
            result = direct_client.ingest(request, artifact, data)
            elapsed_ms = int((time.time() - handoff_started) * 1000)
            artifact["runner_elapsed_ms"] = int(
                (time.time() - started_at) * 1000
            )
            artifact["ingestion_receipt"] = {
                key: result.get(key)
                for key in (
                    "artifact_id",
                    "artifact_status",
                    "file_type",
                    "service_date",
                    "route_key",
                    "batch_id",
                    "elapsed_ms",
                    "http_status",
                    "reason",
                )
                if result.get(key) is not None
            }

            if result.get("durable") is True:
                artifact["handoff_mode"] = "DIRECT_INGESTION"
                artifact["storage_bucket"] = "direct-ingestion-v2"
                artifact["storage_path"] = f"receipt/{artifact_id}"
            else:
                artifact["handoff_mode"] = "STORAGE_FALLBACK"
                artifact["storage_bucket"] = "automation-artifacts"
                artifact["storage_path"] = RUNNER.local_storage_path(
                    request,
                    artifact,
                )

            v2_artifacts[artifact_id] = artifact
            v2_handoff_metrics.append({
                "artifact_id": artifact_id,
                "artifact_key": artifact.get("artifact_key"),
                "handoff_mode": artifact["handoff_mode"],
                "size_bytes": artifact.get("size_bytes"),
                "handoff_ms": elapsed_ms,
                "ingestion_ms": result.get("elapsed_ms"),
            })
            log_evidence.append(
                "Artifact handoff completed.",
                level=(
                    "INFO"
                    if artifact["handoff_mode"] == "DIRECT_INGESTION"
                    else "WARN"
                ),
                stream="HANDOFF",
                metadata=v2_handoff_metrics[-1],
            )

    donor_exit_code, stages, lane_timings, output_tail = execute_donor(
        environment,
        log_evidence,
        on_runtime_marker=handoff_completed_files if v2_active else None,
    )
    log_evidence.append(
        f"Collector exited with status {donor_exit_code}.",
        level="INFO" if donor_exit_code == 0 else "ERROR",
        stream="CONTINUOUS",
    )
    event_types = {
        str(stage.get("event_type") or "")
        for stage in stages
    }
    auth_failure = is_authentication_failure(output_tail, event_types)

    artifacts: list[dict[str, Any]] = []
    upload_metrics: list[dict[str, Any]] = []
    upload_error: str | None = None
    try:
        if v2_active:
            handoff_completed_files()
            artifacts = list(v2_artifacts.values())
            fallback_artifacts = [
                artifact
                for artifact in artifacts
                if artifact.get("handoff_mode") == "STORAGE_FALLBACK"
            ]
            if fallback_artifacts:
                _, fallback_metrics = upload_artifacts(
                    request,
                    started_at,
                    fallback_artifacts,
                )
                upload_metrics = v2_handoff_metrics + [
                    {**metric, "handoff_mode": "STORAGE_FALLBACK"}
                    for metric in fallback_metrics
                ]
            else:
                upload_metrics = v2_handoff_metrics
        else:
            artifacts, upload_metrics = upload_artifacts(request, started_at)
        log_evidence.append(
            f"Artifact handoff prepared {len(artifacts)} file(s).",
            stream="HANDOFF",
            metadata={
                "artifact_count": len(artifacts),
                "artifact_keys": [
                    artifact.get("artifact_key") for artifact in artifacts
                ],
            },
        )
    except Exception as exc:
        upload_error = str(exc)
        log_evidence.append(
            f"Artifact handoff failed: {exc}",
            level="ERROR",
            stream="HANDOFF",
        )

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
    # Source availability is collection health evidence, not an ingestion
    # error. Only a failed collector process or failed persistence handoff is
    # submitted as the request error.
    error_message = upload_error
    if donor_exit_code != 0:
        donor_error = f"Collector exited with status {donor_exit_code}."
        error_message = (
            f"{donor_error} Partial artifacts were preserved."
            if partial
            else donor_error
        )

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
    if v2_active:
        direct_count = sum(
            artifact.get("handoff_mode") == "DIRECT_INGESTION"
            for artifact in artifacts
        )
        fallback_count = sum(
            artifact.get("handoff_mode") == "STORAGE_FALLBACK"
            for artifact in artifacts
        )
        receipt["handoff"] = {
            "contract": "operations_artifact_handoff_v2",
            "direct_ingestion_count": direct_count,
            "storage_fallback_count": fallback_count,
            "direct_ingestion_ms": [
                metric["ingestion_ms"]
                for metric in v2_handoff_metrics
                if metric.get("ingestion_ms") is not None
            ],
        }
    receipt["collection"] = {
        "health": (
            "FAILED"
            if donor_exit_code != 0 or upload_error is not None
            else "EXCEPTIONS"
            if exception_evidence
            else "HEALTHY"
        ),
        "completed_at": utc_iso(completed_at),
        "artifact_count": len(artifacts),
        "exception_count": sum(
            (exception_evidence or {}).get("event_counts", {}).values()
        ),
    }
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

    if v2_active:
        terminal_rpc = "record_operations_runner_cycle_terminal_v2"
        terminal_params = {
            "p_runner_key": args.runner_key,
            "p_cycle_id": cycle_id,
            "p_completed_at": utc_iso(completed_at),
            "p_outcome": outcome,
            "p_receipt_json": receipt,
            "p_artifacts_json": artifacts,
            "p_error_message": error_message,
        }
    else:
        terminal_rpc = (
            "record_operations_dro_runner_cycle_terminal"
            if args.request_type == "DRO_AM"
            else "record_operations_runner_cycle_terminal"
        )
        terminal_params = {
            "p_runner_key": args.runner_key,
            "p_cycle_id": cycle_id,
            "p_service_date": args.service_date,
            "p_started_at": utc_iso(started_at),
            "p_completed_at": utc_iso(completed_at),
            "p_outcome": outcome,
            "p_requested_reports": reports,
            "p_request_payload": payload,
            "p_receipt_json": receipt,
            "p_artifacts_json": artifacts,
            "p_error_message": error_message,
        }
        if args.request_type != "DRO_AM":
            terminal_params["p_request_type"] = args.request_type

    try:
        terminal = RUNNER.rpc(
            terminal_rpc,
            terminal_params,
            timeout_seconds=60,
        )
    except Exception as exc:
        log_evidence.append(
            f"Terminal receipt submission failed: {exc}",
            level="ERROR",
            stream="HANDOFF",
        )
        log_evidence.flush()
        raise

    log_evidence.append(
        f"Terminal receipt accepted with outcome {outcome}.",
        level="INFO" if outcome == "COMPLETE" else "ERROR",
        stream="HANDOFF",
        metadata={"artifact_count": len(artifacts)},
    )
    try:
        preserved_gpx_count = preserve_acknowledged_route_gpx_state(
            request,
            artifacts,
        )
    except Exception as error:
        preserved_gpx_count = 0
        log_evidence.append(
            f"Optional route GPX state preservation was isolated: {error}",
            level="WARN",
            stream="HANDOFF",
        )
    if preserved_gpx_count:
        log_evidence.append(
            "Route GPX baseline state preserved after acknowledged handoff.",
            stream="HANDOFF",
            metadata={"route_gpx_count": preserved_gpx_count},
        )
    spool_release = release_cycle_spool(APP_DIR, cycle_spool)
    log_evidence.append(
        "Cycle-local working files released.",
        level="WARN" if spool_release["error"] else "INFO",
        stream="RETENTION",
        metadata=spool_release,
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

    failure_audit_required = (
        donor_exit_code != 0
        or upload_error is not None
        or outcome != "COMPLETE"
    )
    if failure_audit_required:
        log_evidence.flush()
    else:
        log_evidence.discard()

    if outcome == "COMPLETE":
        if not v2_active or any(
            artifact.get("handoff_mode") == "STORAGE_FALLBACK"
            for artifact in artifacts
        ):
            trigger_ingest(cycle_id)
        return 0
    if auth_failure:
        return 40
    return donor_exit_code or 1


if __name__ == "__main__":
    raise SystemExit(main())

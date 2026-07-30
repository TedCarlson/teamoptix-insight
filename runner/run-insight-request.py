#!/usr/bin/env python3
import json
import hashlib
import os
import re
import subprocess
import sys
import time
import uuid
import urllib.error
import urllib.request
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
INSIGHT_ENV_FILE = Path(os.environ.get(
    "INSIGHT_ENV_FILE",
    "/root/teamoptix-insight/apps/automation-worker/.env.production",
))
RUNNER_KEY = os.environ.get("RUNNER_KEY", "vps-laravel-runner-001")
PROVIDER_KEY = "FEDEX"
DONOR_RUNNER = APP_DIR / "runner" / "run-donor-once.sh"
DONOR_LOCK_FILE = APP_DIR / "runtime" / "locks" / "report-runner.lock"
DONOR_RESERVATION_FILE = (
    APP_DIR / "runtime" / "locks" / "report-runner.reservation"
)
SCRAPER_HOME = APP_DIR / "storage" / "app" / "public" / "scraper"
RUNTIME_LEDGER_DIR = Path(os.environ.get(
    "INSIGHT_RUNTIME_LEDGER_DIR",
    str(APP_DIR / "runtime" / "ledger"),
))

RUNNER_GOALS = {
    "PREVIOUS_DAY_CLOSE": "collect_previous_day_dsw",
    "HISTORICAL_BACKFILL": "collect_historical_dsw_range",
    "TARGETED_RECOVERY": "collect_targeted_artifacts",
}

def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def artifact_execution_key(request: dict, artifact: dict) -> str:
    identity = "|".join([
        str(request.get("id") or ""),
        str(artifact.get("service_date") or ""),
        str(artifact.get("artifact_key") or ""),
        str(artifact.get("filename") or artifact.get("path") or ""),
    ])
    return str(uuid.uuid5(uuid.NAMESPACE_URL, identity))


def lane_key_for_artifact(artifact: dict) -> str:
    key = str(artifact.get("artifact_key") or "").upper()
    if key == "DSW_DAILY_SERVICE":
        return "DSW"
    if key == "DRO_PACKAGE_DETAIL":
        return "DRO_PACKAGE_DETAIL"
    if key.startswith("FCC_SERVICE_AREA"):
        return "FCC_WORK_AREA_SUMMARY"
    if key == "PICKUP_MANIFEST":
        return "FCC_PICKUP_MANIFESTS"
    if key == "DELIVERY_MANIFEST":
        return "FCC_DELIVERY_MANIFESTS"
    return key or "UNKNOWN"


def governed_runner_goal(request: dict) -> str:
    request_type = str(request.get("request_type") or "").strip().upper()
    payload = request.get("request_payload") or {}
    authored_goal = str(payload.get("runner_goal") or "").strip()
    expected_goal = RUNNER_GOALS.get(request_type, authored_goal)

    if request_type in RUNNER_GOALS and authored_goal and authored_goal != expected_goal:
        raise RuntimeError(
            f"Ticket contract mismatch: {request_type} requires runner_goal "
            f"{expected_goal}, received {authored_goal}."
        )

    return expected_goal

def service_date_folder(service_date: str | None) -> str:
    if not service_date:
        return time.strftime("%m-%d-%Y")
    yyyy, mm, dd = service_date.split("-")
    return f"{mm}-{dd}-{yyyy}"


def request_service_dates(request: dict) -> list[str]:
    service_date = str(request.get("service_date") or "").strip()
    if service_date:
        return [service_date]

    start_text = str(request.get("service_date_start") or "").strip()
    end_text = str(request.get("service_date_end") or "").strip()

    if not start_text or not end_text:
        return [time.strftime("%Y-%m-%d")]

    start = date.fromisoformat(start_text)
    end = date.fromisoformat(end_text)

    if end < start:
        raise RuntimeError("Historical end date must be on or after start date.")

    dates = []
    current = start
    while current <= end:
        dates.append(current.isoformat())
        current += timedelta(days=1)

    return dates

def infer_report_identity(filename: str) -> dict:
    name = filename.lower()
    compact_name = re.sub(r"[^a-z0-9]+", "", name)

    if "packageleveldetails" in compact_name:
        return {
            "artifact_key": "DSW_ALL_STATUS_CODE_PACKAGES",
            "report_family_key": "DSW",
            "report_shape_key": "DSW_ALL_STATUS_CODE_PACKAGES",
            "report_frame": None,
            "display_filename": "All Status Code Packages.xls",
        }
    if "packagedetail" in compact_name and name.endswith(".csv"):
        return {
            "artifact_key": "DRO_PACKAGE_DETAIL",
            "report_family_key": "DRO",
            "report_shape_key": "DRO_PACKAGE_DETAIL",
            "report_frame": None,
            "display_filename": "package_detail.csv",
        }
    if "daily service worksheet" in name:
        return {"artifact_key": "DSW_DAILY_SERVICE", "report_family_key": "DSW", "report_shape_key": "DSW_DAILY_SERVICE_WORKSHEET", "report_frame": None, "display_filename": "Daily Service Worksheet.xlsx"}
    if "serviceareasummary" in name or "sasummary" in name:
        return {"artifact_key": "FCC_SERVICE_AREA_SUMMARY", "report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Service Area Summary.xlsx"}
    if "serviceareastatus" in name or "sastatus" in name:
        return {"artifact_key": "FCC_SERVICE_AREA_STATUS", "report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Work Area Summary.xlsx"}
    if "combinedmanifest" in compact_name or re.match(r"^cm\d{8}[_-]", name) or name.startswith("cm_"):
        return {"artifact_key": "COMBINED_MANIFEST", "report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Combined Manifest.xlsx"}
    if "deliverymanifest" in compact_name or re.match(r"^\d{8}_\d{3}\s+.+\.xls$", name):
        return {"artifact_key": "DELIVERY_MANIFEST", "report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Delivery Manifest.xlsx"}
    if "pickupmanifest" in compact_name or re.match(r"^pm\d{8}[_-]", name) or name.startswith("pm"):
        return {"artifact_key": "PICKUP_MANIFEST", "report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Pickup Manifest.xlsx"}
    if "pickupassignments" in name or name.startswith("pa"):
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Pickup Assignments.xlsx"}
    if "reorderpulistings" in name or name.startswith("rpl"):
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Reorder PU Listings.xlsx"}

    return {"artifact_key": "UNKNOWN", "report_family_key": None, "report_shape_key": None, "report_frame": None, "display_filename": filename}

def artifact_priority(artifact: dict) -> int:
    key = str(artifact.get("artifact_key") or "").upper()
    family = str(artifact.get("report_family_key") or "").upper()
    if family == "DSW":
        return 10
    if family == "DRO":
        return 15
    if key.startswith("FCC_SERVICE_AREA"):
        return 20
    if key == "PICKUP_MANIFEST":
        return 30
    if key == "DELIVERY_MANIFEST":
        return 40
    return 100

def storage_slug(value: str) -> str:
    cleaned = []
    previous_dash = False
    for char in value.lower():
        if char.isalnum():
            cleaned.append(char)
            previous_dash = False
        elif not previous_dash:
            cleaned.append("-")
            previous_dash = True
    return "".join(cleaned).strip("-") or "artifact"

def local_storage_path(request: dict, artifact: dict) -> str:
    company_slug = request.get("company_slug") or "unknown-company"
    service_date = artifact.get("service_date") or request.get("service_date") or time.strftime("%Y-%m-%d")
    request_id = request.get("id") or "unknown-request"
    family = artifact.get("report_family_key") or "unknown"
    original_filename = artifact.get("filename") or "artifact"
    return "/".join([
        f"company={company_slug}",
        f"service_date={service_date}",
        f"request={request_id}",
        storage_slug(family),
        original_filename,
    ])

def request_targets(request: dict) -> list[dict]:
    payload = request.get("request_payload") or {}
    targets = payload.get("targets")
    return targets if isinstance(targets, list) else []

def target_artifact_keys(request: dict) -> set[str]:
    return {
        str(target.get("artifact_key") or "").strip().upper()
        for target in request_targets(request)
        if isinstance(target, dict) and str(target.get("artifact_key") or "").strip()
    }

def manifest_runtime_options(request: dict) -> dict:
    payload = request.get("request_payload") or {}
    raw_types = payload.get("manifest_types")
    artifact_keys = target_artifact_keys(request)

    manifest_types: list[str] = []

    if isinstance(raw_types, list):
        for value in raw_types:
            normalized = str(value or "").strip().lower()
            if normalized in {"combined", "delivery", "pickup"} and normalized not in manifest_types:
                manifest_types.append(normalized)

    if not manifest_types:
        inferred = []
        if "COMBINED_MANIFEST" in artifact_keys:
            inferred.append("combined")
        if "DELIVERY_MANIFEST" in artifact_keys:
            inferred.append("delivery")
        if "PICKUP_MANIFEST" in artifact_keys:
            inferred.append("pickup")
        manifest_types = inferred

    skip_combined_payload = payload.get("skip_combined")
    skip_combined = skip_combined_payload is True or str(skip_combined_payload).strip().lower() in {"1", "true", "yes", "on"}

    if manifest_types and "combined" not in manifest_types:
        skip_combined = True

    if skip_combined:
        manifest_types = [value for value in manifest_types if value != "combined"]

    return {
        "manifest_types": manifest_types,
        "skip_combined": skip_combined,
    }

def target_runner_sections(request: dict) -> list[str]:
    sections: list[str] = []
    for target in request_targets(request):
        if not isinstance(target, dict):
            continue

        runner_section = str(target.get("runner_section") or "").strip().upper()
        if runner_section == "P_AND_D":
            section = "P&D"
        elif runner_section == "SERVICE":
            section = "Service"
        elif runner_section == "DAILY_SERVICE":
            section = "Daily Service"
        elif runner_section == "DRO":
            section = "DRO"
        else:
            continue

        if section not in sections:
            sections.append(section)

    section_order = {
        "DRO": 5,
        "Service": 10,
        "Daily Service": 20,
        "P&D": 30,
    }
    return sorted(sections, key=lambda section: section_order.get(section, 999))

def artifact_matches_targets(request: dict, artifact: dict) -> bool:
    targets = request_targets(request)
    if not targets:
        return True

    filename = str(artifact.get("filename") or "").lower()
    display = str(artifact.get("display_filename") or "").lower()
    haystack = f"{filename} {display}"
    compact_haystack = re.sub(r"[^a-z0-9]+", "", haystack)

    for target in targets:
        if not isinstance(target, dict):
            continue

        target_artifact_key = str(
            target.get("artifact_key") or ""
        ).strip().upper()
        artifact_key = str(
            artifact.get("artifact_key") or ""
        ).strip().upper()
        if target_artifact_key and target_artifact_key == artifact_key:
            return True

        patterns = target.get("expected_filename_match")
        if not isinstance(patterns, list):
            continue

        for pattern in patterns:
            needle = str(pattern or "").strip().lower()
            compact_needle = re.sub(r"[^a-z0-9]+", "", needle)
            if needle and (needle in haystack or compact_needle in compact_haystack):
                return True

    return False

def load_runner_artifact_metadata(file: Path) -> dict:
    sidecar = Path(f"{file}.runner.json")

    if not sidecar.exists() or not sidecar.is_file():
        return {}

    try:
        metadata = json.loads(sidecar.read_text(encoding="utf-8"))
    except Exception as exc:
        print(json.dumps({
            "event": "runner_metadata_read_failed",
            "filename": file.name,
            "sidecar": str(sidecar),
            "error": str(exc),
        }))
        return {}

    if not isinstance(metadata, dict):
        return {}

    result = {
        "header_identity": {
            "page": metadata.get("page"),
            "manifest_type": metadata.get("manifest_type"),
            "service_date_raw": metadata.get("service_date_raw"),
            "service_date_compact": metadata.get("service_date_compact"),
            "service_area": metadata.get("service_area"),
            "work_area": metadata.get("work_area"),
            "driver": metadata.get("driver"),
            "isp_ic": metadata.get("isp_ic"),
            "vehicle": metadata.get("vehicle"),
        },
        "header_authoritative": metadata.get(
            "header_authoritative",
            False,
        ),
        "source_download_filename": metadata.get(
            "source_download_filename"
        ),
        "canonical_filename": metadata.get("canonical_filename"),
        "download_source_hash": metadata.get("source_hash"),
        "contract_number": metadata.get("contract_number"),
        "expected_package_count": metadata.get(
            "expected_package_count"
        ),
        "facility_identity": metadata.get("facility_identity"),
        "discovery_status": metadata.get("discovery_status"),
    }

    for key in (
        "artifact_key",
        "report_family_key",
        "report_shape_key",
    ):
        value = metadata.get(key)
        if value:
            result[key] = value

    return result


def collect_artifacts(request: dict, run_started_at: float) -> list[dict]:
    artifacts = []

    for service_date in request_service_dates(request):
        folder_name = service_date_folder(service_date)
        excel_dir = SCRAPER_HOME / "Excels" / folder_name

        if not excel_dir.exists():
            continue

        for file in sorted(excel_dir.iterdir()):
            if not file.is_file():
                continue

            if file.name.endswith(".runner.json"):
                continue

            if file.stat().st_mtime < run_started_at - 2:
                continue

            identity = infer_report_identity(file.name)
            runner_metadata = load_runner_artifact_metadata(file)

            # Manifests are not valid handoff artifacts until Header identity
            # extraction and canonicalization have completed. Raw browser
            # downloads such as DeliveryManifest (3).xls must fail closed.
            if identity.get("artifact_key") in {
                "COMBINED_MANIFEST", "DELIVERY_MANIFEST", "PICKUP_MANIFEST"
            } and not runner_metadata.get("header_authoritative"):
                continue

            artifact = {
                "kind": "REPORT_FILE",
                "service_date": service_date,
                "path": str(file),
                "filename": file.name,
                "size_bytes": file.stat().st_size,
                "content_type": (
                    "text/csv"
                    if file.suffix.lower() == ".csv"
                    else "application/vnd.ms-excel"
                    if file.suffix.lower() == ".xls"
                    else "application/octet-stream"
                ),
                **identity,
                **runner_metadata,
            }

            if not artifact_matches_targets(request, artifact):
                continue

            artifact["storage_bucket"] = "automation-artifacts"
            artifact["storage_path"] = local_storage_path(request, artifact)
            artifact["artifact_execution_key"] = artifact_execution_key(
                request, artifact
            )
            artifact["lane_key"] = lane_key_for_artifact(artifact)
            artifact["download_completed_at"] = time.strftime(
                "%Y-%m-%dT%H:%M:%SZ",
                time.gmtime(file.stat().st_mtime),
            )
            artifacts.append(artifact)

    return sorted(artifacts, key=lambda artifact: (artifact_priority(artifact), artifact["filename"]))

def package_artifact_payload(artifact: dict) -> bytes:
    local_path = Path(artifact["path"])
    if not local_path.exists():
        raise RuntimeError(f"Artifact file missing before upload: {local_path}")

    data = local_path.read_bytes()
    artifact["size_bytes"] = len(data)
    artifact["source_hash"] = hashlib.sha256(data).hexdigest()
    return data


def upload_artifact_to_storage(artifact: dict, data: bytes) -> dict:

    bucket = artifact["storage_bucket"]
    storage_path = artifact["storage_path"]

    bucket_part = urllib.parse.quote(bucket, safe="")
    path_part = urllib.parse.quote(storage_path, safe="/=")

    req = urllib.request.Request(
        f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{bucket_part}/{path_part}",
        data=data,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": artifact.get("content_type") or "application/octet-stream",
            "x-upsert": "true",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {"status": res.status}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Storage upload failed: HTTP {exc.code} {detail}") from exc


def register_artifact(request: dict, artifact: dict) -> dict:
    return rpc("register_operations_collection_artifact", {
        "p_collection_request_id": request["id"],
        "p_company_id": request["company_id"],
        "p_service_date": artifact.get("service_date") or request.get("service_date"),
        "p_artifact_kind": artifact.get("kind") or "REPORT_FILE",
        "p_report_family_key": artifact.get("report_family_key"),
        "p_report_shape_key": artifact.get("report_shape_key"),
        "p_report_frame": artifact.get("report_frame"),
        "p_artifact_status": "READY_FOR_INGEST",
        "p_storage_bucket": artifact["storage_bucket"],
        "p_storage_path": artifact["storage_path"],
        "p_original_filename": artifact["filename"],
        "p_normalized_filename": artifact.get("display_filename") or artifact["filename"],
        "p_content_type": artifact.get("content_type"),
        "p_size_bytes": artifact.get("size_bytes") or 0,
        "p_source_hash": artifact.get("source_hash"),
        "p_runner_key": RUNNER_KEY,
        "p_runner_artifact_json": artifact,
    })

def handoff_artifact(request: dict, artifact: dict) -> dict:
    record_runtime_event(
        request,
        "DOWNLOAD_COMPLETED",
        "DOWNLOAD",
        occurred_at=artifact.get("download_completed_at"),
        artifact=artifact,
        metadata={
            "filename": artifact.get("filename"),
            "size_bytes": artifact.get("size_bytes"),
        },
    )

    packaging_started = time.time()
    record_runtime_event(
        request,
        "PAYLOAD_PACKAGING_STARTED",
        "PAYLOAD_PACKAGING",
        artifact=artifact,
    )
    payload = package_artifact_payload(artifact)
    record_runtime_event(
        request,
        "PAYLOAD_PACKAGING_COMPLETED",
        "PAYLOAD_PACKAGING",
        artifact=artifact,
        duration_ms=int((time.time() - packaging_started) * 1000),
        outcome="COMPLETE",
        metadata={
            "filename": artifact.get("filename"),
            "canonical_filename": artifact.get("canonical_filename"),
            "size_bytes": artifact.get("size_bytes"),
            "source_hash": artifact.get("source_hash"),
            "storage_path": artifact.get("storage_path"),
        },
    )

    upload_started_at = utc_now()
    upload_started = time.time()
    record_runtime_event(
        request,
        "UPLOAD_STARTED",
        "UPLOAD",
        occurred_at=upload_started_at,
        artifact=artifact,
    )
    upload_artifact_to_storage(artifact, payload)
    upload_ms = int((time.time() - upload_started) * 1000)
    record_runtime_event(
        request,
        "UPLOAD_COMPLETED",
        "UPLOAD",
        artifact=artifact,
        duration_ms=upload_ms,
        outcome="COMPLETE",
        metadata={
            "storage_bucket": artifact.get("storage_bucket"),
            "storage_path": artifact.get("storage_path"),
            "size_bytes": artifact.get("size_bytes"),
        },
    )

    registration_started = time.time()
    record_runtime_event(
        request,
        "REGISTRATION_STARTED",
        "REGISTRATION",
        artifact=artifact,
    )
    registered = register_artifact(request, artifact)
    artifact_id = (
        registered.get("id") if isinstance(registered, dict) else None
    )
    record_runtime_event(
        request,
        "REGISTRATION_COMPLETED",
        "REGISTRATION",
        artifact=artifact,
        artifact_id=artifact_id,
        duration_ms=int((time.time() - registration_started) * 1000),
        outcome="COMPLETE",
    )
    return registered

def register_artifacts(request: dict, artifacts: list[dict]) -> list[dict]:
    registered = []
    for artifact in artifacts:
        registered.append(handoff_artifact(request, artifact))
    return registered

def register_new_artifacts(
    request: dict,
    run_started_at: float,
    registered_paths: set[str],
    segment_started_at: float,
) -> list[dict]:
    registered = []
    segment_elapsed_ms = int((time.time() - segment_started_at) * 1000)
    for artifact in collect_artifacts(request, run_started_at):
        local_path = str(artifact["path"])
        if local_path in registered_paths:
            continue
        artifact["runner_elapsed_ms"] = segment_elapsed_ms
        artifact["handoff_registered_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        registered.append(handoff_artifact(request, artifact))
        registered_paths.add(local_path)
        print(json.dumps({
            "event": "artifact_registered",
            "request_id": request.get("id"),
            "artifact_key": artifact.get("artifact_key"),
            "service_date": artifact.get("service_date"),
            "filename": artifact.get("filename"),
            "runner_elapsed_ms": segment_elapsed_ms,
        }))
    return registered

def load_env_file(path: Path) -> dict:
    env = {}
    if not path.exists():
        raise RuntimeError(f"Insight env file not found: {path}")
    for line in path.read_text(errors="ignore").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env

INSIGHT_ENV = load_env_file(INSIGHT_ENV_FILE)
SUPABASE_URL = INSIGHT_ENV.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = INSIGHT_ENV.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")

def rpc(name: str, payload: dict, timeout_seconds: int = 45):
    req = urllib.request.Request(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"RPC {name} failed: HTTP {exc.code} {detail}") from exc


def record_runtime_event(
    request: dict,
    event_type: str,
    stage: str,
    *,
    occurred_at: str | None = None,
    artifact: dict | None = None,
    artifact_id: str | None = None,
    lane_key: str | None = None,
    attempt_number: int = 1,
    outcome: str | None = None,
    duration_ms: int | None = None,
    metadata: dict | None = None,
    idempotency_suffix: str | None = None,
):
    artifact = artifact or {}
    execution_key = artifact.get("artifact_execution_key")
    lane = lane_key or artifact.get("lane_key")
    route_identity = (
        (artifact.get("header_identity") or {}).get("work_area")
        or artifact.get("route_identity")
    )
    suffix = idempotency_suffix or execution_key or lane or "request"
    idempotency_key = (
        f"runner:{RUNNER_KEY}:{request['id']}:{event_type}:"
        f"{suffix}:attempt-{attempt_number}"
    )
    event_payload = {
        "p_collection_request_id": request["id"],
        "p_idempotency_key": idempotency_key,
        "p_source_system": "RUNNER",
        "p_event_type": event_type,
        "p_stage": stage,
        "p_occurred_at": occurred_at or utc_now(),
        "p_artifact_id": artifact_id,
        "p_lane_key": lane,
        "p_artifact_execution_key": execution_key,
        "p_artifact_key": artifact.get("artifact_key"),
        "p_route_identity": route_identity,
        "p_attempt_number": attempt_number,
        "p_outcome": outcome,
        "p_duration_ms": duration_ms,
        "p_metadata_json": metadata or {},
    }

    # Preserve the exact event submitted to Insight as a request-scoped JSONL
    # journal. This gives the runner a replayable forensic record if the API is
    # briefly unavailable without making telemetry a collection dependency.
    try:
        RUNTIME_LEDGER_DIR.mkdir(parents=True, exist_ok=True)
        journal_path = RUNTIME_LEDGER_DIR / f"{request['id']}.jsonl"
        journal_entry = {
            "journal_version": "operations_runtime_v1",
            "journaled_at": utc_now(),
            "runner_key": RUNNER_KEY,
            "rpc": "record_operations_collection_runtime_event",
            "payload": event_payload,
        }
        with journal_path.open("a", encoding="utf-8") as journal:
            journal.write(json.dumps(journal_entry, separators=(",", ":")) + "\n")
    except Exception as exc:
        print(
            "[insight-runner] runtime journal write failed "
            f"event={event_type} stage={stage}: {exc}",
            file=sys.stderr,
        )

    try:
        return rpc(
            "record_operations_collection_runtime_event",
            event_payload,
            timeout_seconds=5,
        )
    except Exception as exc:
        print(
            "[insight-runner] runtime event write failed "
            f"event={event_type} stage={stage}: {exc}",
            file=sys.stderr,
        )
        return None

def one(row_or_rows):
    if isinstance(row_or_rows, list):
        return row_or_rows[0] if row_or_rows else None
    return row_or_rows


def donor_run_active() -> bool:
    try:
        pid = int(DONOR_LOCK_FILE.read_text(encoding="utf-8").strip())
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


def reserve_donor_slot(request: dict) -> None:
    request_id = str(request.get("id") or "").strip()
    if not request_id:
        raise RuntimeError("Cannot reserve the donor slot without a request ID.")
    DONOR_RESERVATION_FILE.parent.mkdir(parents=True, exist_ok=True)
    existing = ""
    try:
        existing = DONOR_RESERVATION_FILE.read_text(
            encoding="utf-8"
        ).strip()
    except FileNotFoundError:
        pass
    if existing and existing != request_id:
        raise RuntimeError(
            f"Donor slot is already reserved for governed request {existing}."
        )
    DONOR_RESERVATION_FILE.write_text(request_id, encoding="utf-8")


def release_donor_reservation(request_id: str) -> None:
    try:
        existing = DONOR_RESERVATION_FILE.read_text(
            encoding="utf-8"
        ).strip()
        if existing == request_id:
            DONOR_RESERVATION_FILE.unlink()
    except FileNotFoundError:
        pass


def wait_for_donor_slot(request: dict) -> None:
    timeout_seconds = int(
        os.environ.get("INSIGHT_DONOR_WAIT_SECONDS", "3600")
    )
    deadline = time.monotonic() + timeout_seconds
    next_heartbeat = 0.0
    announced = False

    while donor_run_active():
        now = time.monotonic()
        if now >= deadline:
            raise RuntimeError(
                "Timed out waiting for the serial donor slot."
            )
        if not announced:
            print(
                "[insight-runner] queued behind active donor; "
                "waiting for serial slot"
            )
            announced = True
        if now >= next_heartbeat:
            record_runtime_event(
                request,
                "WAITING_FOR_DONOR",
                "CLAIM",
                metadata={"serial_slot": "report-runner"},
            )
            next_heartbeat = now + 30
        time.sleep(0.25)

    if announced:
        print("[insight-runner] serial donor slot available")


def update_status(request_id: str, status: str, error_message: str | None = None):
    return rpc("update_operations_collection_request_status", {
        "p_request_id": request_id,
        "p_request_status": status,
        "p_error_message": error_message,
        "p_automation_run_id": None,
        "p_report_batch_ids": None,
    })

def get_profile(company_id: str):
    return rpc("get_or_create_automation_profile", {
        "p_company_id": company_id,
        "p_provider_key": PROVIDER_KEY,
    })

def get_credential(profile_id: str):
    return one(rpc("get_automation_credential_for_verify", {
        "p_profile_id": profile_id,
    }))

def main() -> int:
    print(f"[insight-runner] claim runner={RUNNER_KEY}")
    request = one(rpc("claim_operations_collection_request", {
        "p_runner_key": RUNNER_KEY,
    }))

    if not request or not request.get("id") or not request.get("company_id"):
        print("[insight-runner] no queued request")
        return 0

    request_id = request["id"]
    record_runtime_event(
        request,
        "RUNNER_ACCEPTED",
        "CLAIM",
        metadata={"runner_key": RUNNER_KEY},
    )
    print(json.dumps({
        "event": "claimed",
        "id": request_id,
        "company_slug": request.get("company_slug"),
        "request_type": request.get("request_type"),
        "runner_goal": governed_runner_goal(request),
        "priority": request.get("priority"),
        "service_date": request.get("service_date"),
        "collect_scope": (request.get("request_payload") or {}).get("collect_scope"),
        "targets": request_targets(request),
        "runner_sections": target_runner_sections(request),
    }, indent=2))

    reservation_owned = False
    try:
        credential_started = time.time()
        profile = get_profile(request["company_id"])
        if not profile:
            raise RuntimeError("No FEDEX automation profile returned.")

        if profile.get("status") != "HEALTHY":
            raise RuntimeError(f"FedEx credentials are not verified healthy. status={profile.get('status')}")

        credential = get_credential(profile["id"])
        if not credential or not credential.get("username") or not credential.get("encrypted_secret"):
            raise RuntimeError("No usable FedEx credential returned.")

        record_runtime_event(
            request,
            "CREDENTIALS_RESOLVED",
            "CREDENTIALS",
            duration_ms=int((time.time() - credential_started) * 1000),
            metadata={"profile_id": profile.get("id")},
        )
        reserve_donor_slot(request)
        reservation_owned = True
        update_status(request_id, "RUNNING")
        wait_for_donor_slot(request)

        run_started_at = time.time()

        child_env = os.environ.copy()
        child_env["FCMS_FEDEX_USERNAME"] = credential["username"]
        child_env["FCMS_FEDEX_PASSWORD"] = credential["encrypted_secret"]
        child_env["FCMS_REQUEST_ID"] = request_id
        child_env["FCMS_COMPANY_ID"] = request["company_id"]
        child_env["FCMS_COMPANY_SLUG"] = request.get("company_slug") or ""
        child_env["FCMS_SERVICE_DATE"] = request.get("service_date") or ""
        child_env["FCMS_SERVICE_DATE_START"] = request.get("service_date_start") or ""
        child_env["FCMS_SERVICE_DATE_END"] = request.get("service_date_end") or ""
        child_env["FCMS_REQUEST_TYPE"] = request.get("request_type") or ""
        child_env["FCMS_RUNNER_GOAL"] = governed_runner_goal(request)
        child_env["FCMS_COLLECTION_SCOPE"] = (request.get("request_payload") or {}).get("collect_scope") or ""
        manifest_options = manifest_runtime_options(request)

        child_env["FCMS_TARGET_SECTIONS"] = ",".join(target_runner_sections(request))
        child_env["FCMS_TARGET_ARTIFACT_KEYS"] = ",".join(sorted(target_artifact_keys(request)))
        dro_target = next(
            (
                target
                for target in request_targets(request)
                if isinstance(target, dict)
                and str(target.get("runner_section") or "").strip().upper()
                == "DRO"
            ),
            {},
        )
        payload = request.get("request_payload") or {}
        child_env["FCMS_DRO_SERVICE_AREA"] = str(
            dro_target.get("service_area")
            or payload.get("dro_service_area")
            or ""
        ).strip()
        child_env["FCMS_DRO_BUSINESS_NAME"] = str(
            dro_target.get("business_name")
            or payload.get("dro_business_name")
            or ""
        ).strip()
        child_env["FCMS_MANIFEST_TYPES"] = ",".join(manifest_options["manifest_types"])
        child_env["FCMS_SKIP_COMBINED"] = "1" if manifest_options["skip_combined"] else "0"
        child_env["FCMS_SINGLE_SESSION"] = "1"
        child_env["FCMS_PERSIST_BROWSER"] = "1"
        child_env["FCMS_CHROME_DEBUGGER_ADDRESS"] = "127.0.0.1:9222"
        continuous_runtime_dir = APP_DIR / "runtime" / "continuous-runner"
        continuous_runtime_dir.mkdir(parents=True, exist_ok=True)
        continuous_runtime_dir.chmod(0o700)
        chrome_profile_dir = continuous_runtime_dir / "chrome-profile"
        chrome_profile_dir.mkdir(parents=True, exist_ok=True)
        chrome_profile_dir.chmod(0o700)
        child_env["FCMS_CHROME_PROFILE_DIR"] = str(chrome_profile_dir)
        child_env["FCMS_SESSION_COOKIE_FILE"] = str(
            continuous_runtime_dir / "fedex-session.json"
        )

        print("[insight-runner] ready to execute donor runner")
        if os.environ.get("INSIGHT_RUNNER_DRY_RUN", "1") == "1":
            print("[insight-runner] dry run only; scraper not executed")
            artifacts = collect_artifacts(request, run_started_at)
            registered = register_artifacts(request, artifacts)
            print(json.dumps({
                "event": "artifact_manifest",
                "dry_run": True,
                "artifact_count": len(artifacts),
                "registered_count": len(registered),
                "artifacts": artifacts,
            }, indent=2))
            update_status(request_id, "ARTIFACTS_READY" if registered else "COMPLETE")
            return 0

        started = time.time()
        record_runtime_event(
            request,
            "COLLECTION_STARTED",
            "COLLECTION",
            metadata={"execution_mode": "SERIAL"},
        )
        proc = subprocess.Popen(
            [str(DONOR_RUNNER)],
            cwd=str(APP_DIR),
            env=child_env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
        )
        registered = []
        registered_paths: set[str] = set()
        segment_started_at = started
        active_lane = None
        last_heartbeat_at = 0.0
        authentication_completed = False
        auth_attempt_number = 0
        active_auth_started_at = None
        assert proc.stdout is not None
        for line in proc.stdout:
            print(line, end="")
            now = time.time()
            runtime_marker = line.find("RUNTIME_EVENT ")
            if runtime_marker >= 0:
                try:
                    runtime_payload = json.loads(
                        line[runtime_marker + len("RUNTIME_EVENT "):].strip()
                    )
                    runtime_artifact = None
                    if runtime_payload.get("artifact_key") or runtime_payload.get("filename"):
                        runtime_artifact = {
                            "service_date": (
                                request.get("service_date")
                                or time.strftime("%Y-%m-%d")
                            ),
                            "artifact_key": runtime_payload.get("artifact_key"),
                            "filename": runtime_payload.get("filename"),
                            "lane_key": runtime_payload.get("lane_key"),
                            "route_identity": runtime_payload.get("route_identity"),
                        }
                        runtime_artifact["artifact_execution_key"] = (
                            artifact_execution_key(request, runtime_artifact)
                        )
                    marker_event_type = str(
                        runtime_payload.get("event_type") or "PROGRESS"
                    )
                    marker_duration_ms = runtime_payload.get("duration_ms")
                    marker_attempt_number = 1
                    marker_suffix = (
                        runtime_artifact["artifact_execution_key"]
                        if runtime_artifact else "request"
                    )
                    if marker_event_type == "AUTH_COMPLETED":
                        marker_attempt_number = max(auth_attempt_number, 1)
                        marker_suffix = f"auth-{marker_attempt_number}"
                        if active_auth_started_at is not None:
                            marker_duration_ms = int(
                                (time.time() - active_auth_started_at) * 1000
                            )
                    record_runtime_event(
                        request,
                        marker_event_type,
                        str(runtime_payload.get("stage") or "COLLECTION"),
                        occurred_at=runtime_payload.get("occurred_at"),
                        artifact=runtime_artifact,
                        lane_key=runtime_payload.get("lane_key"),
                        attempt_number=marker_attempt_number,
                        duration_ms=marker_duration_ms,
                        metadata=runtime_payload.get("metadata") or {},
                        idempotency_suffix=marker_suffix,
                    )
                    if marker_event_type == "AUTH_COMPLETED":
                        authentication_completed = True
                except Exception as marker_exc:
                    print(
                        "[insight-runner] runtime marker rejected: "
                        f"{marker_exc}",
                        file=sys.stderr,
                    )
            if (
                not authentication_completed
                and re.search(r"Login successfull|Login successful", line, re.I)
            ):
                record_runtime_event(
                    request, "AUTH_COMPLETED", "AUTHENTICATION"
                )
                authentication_completed = True
            section_match = re.search(
                r"\[runner\] section start:\s*(.+)$", line.strip()
            )
            governed_match = re.search(
                r"\[runner\] governed date start:\s*(.+)$", line.strip()
            )
            if section_match or governed_match:
                active_lane = (
                    section_match.group(1).strip()
                    if section_match else "DSW"
                )
                auth_attempt_number += 1
                active_auth_started_at = time.time()
                record_runtime_event(
                    request,
                    "AUTH_STARTED",
                    "AUTHENTICATION",
                    lane_key=active_lane,
                    attempt_number=auth_attempt_number,
                    idempotency_suffix=f"auth-{auth_attempt_number}",
                )
                record_runtime_event(
                    request,
                    "LANE_STARTED",
                    "SOURCE",
                    lane_key=active_lane,
                    idempotency_suffix=(
                        f"{active_lane}:{governed_match.group(1).strip()}"
                        if governed_match else active_lane
                    ),
                    metadata={
                        "service_date": (
                            governed_match.group(1).strip()
                            if governed_match else None
                        )
                    },
                )
            if "[runner] section exit" in line or "[runner] governed date exit" in line:
                registered.extend(register_new_artifacts(
                    request,
                    run_started_at,
                    registered_paths,
                    segment_started_at,
                ))
                record_runtime_event(
                    request,
                    "LANE_COMPLETED",
                    "SOURCE",
                    lane_key=active_lane,
                    duration_ms=int((time.time() - segment_started_at) * 1000),
                    outcome="COMPLETE",
                    idempotency_suffix=(
                        f"{active_lane}:{int(segment_started_at)}"
                    ),
                )
                segment_started_at = time.time()
            if now - last_heartbeat_at >= 30:
                record_runtime_event(
                    request,
                    "HEARTBEAT",
                    "COLLECTION",
                    lane_key=active_lane,
                    idempotency_suffix=str(int(now // 30)),
                    metadata={"message": line.strip()[-500:]},
                )
                last_heartbeat_at = now
        return_code = proc.wait()
        elapsed_ms = int((time.time() - started) * 1000)
        record_runtime_event(
            request,
            "COLLECTION_COMPLETED",
            "COLLECTION",
            duration_ms=elapsed_ms,
            outcome="COMPLETE" if return_code == 0 else "FAILED",
            metadata={"donor_exit_code": return_code},
        )
        print(f"[insight-runner] donor exit={return_code} elapsed_ms={elapsed_ms}")

        registered.extend(register_new_artifacts(
            request,
            run_started_at,
            registered_paths,
            segment_started_at,
        ))
        artifacts = collect_artifacts(request, run_started_at)
        print(json.dumps({
            "event": "artifact_manifest",
            "dry_run": False,
            "donor_exit_code": return_code,
            "artifact_count": len(artifacts),
            "registered_count": len(registered),
            "artifacts": artifacts,
        }, indent=2))

        if return_code != 0:
            if registered:
                update_status(
                    request_id,
                    "ARTIFACTS_READY",
                    f"Donor runner failed with exit code {return_code}; partial artifacts registered."
                )
                return 0

            update_status(request_id, "FAILED", f"Donor runner failed with exit code {return_code}")
            return return_code

        runner_goal = governed_runner_goal(request)
        if runner_goal in RUNNER_GOALS.values() and not registered:
            update_status(
                request_id,
                "FAILED",
                f"{request.get('request_type')} produced no governed report artifact; completion is invalid."
            )
            return 1

        update_status(request_id, "ARTIFACTS_READY" if registered else "COMPLETE")
        return 0

    except Exception as exc:
        print(f"[insight-runner] failed: {exc}", file=sys.stderr)
        try:
            update_status(request_id, "FAILED", str(exc))
        except Exception as update_exc:
            print(f"[insight-runner] failed to mark request failed: {update_exc}", file=sys.stderr)
        return 1
    finally:
        if reservation_owned:
            release_donor_reservation(request_id)

if __name__ == "__main__":
    raise SystemExit(main())

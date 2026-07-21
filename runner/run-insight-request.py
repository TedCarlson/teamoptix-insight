#!/usr/bin/env python3
import json
import hashlib
import os
import re
import subprocess
import sys
import time
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
SCRAPER_HOME = APP_DIR / "storage" / "app" / "public" / "scraper"

RUNNER_GOALS = {
    "PREVIOUS_DAY_CLOSE": "collect_previous_day_dsw",
    "HISTORICAL_BACKFILL": "collect_historical_dsw_range",
    "TARGETED_RECOVERY": "collect_targeted_artifacts",
}


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
        else:
            continue

        if section not in sections:
            sections.append(section)

    section_order = {"Service": 10, "Daily Service": 20, "P&D": 30}
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

    return {
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
    }


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
                "content_type": "application/vnd.ms-excel" if file.suffix.lower() == ".xls" else "application/octet-stream",
                **identity,
                **runner_metadata,
            }

            if not artifact_matches_targets(request, artifact):
                continue

            artifact["storage_bucket"] = "automation-artifacts"
            artifact["storage_path"] = local_storage_path(request, artifact)
            artifacts.append(artifact)

    return sorted(artifacts, key=lambda artifact: (artifact_priority(artifact), artifact["filename"]))

def upload_artifact_to_storage(artifact: dict) -> dict:
    local_path = Path(artifact["path"])
    if not local_path.exists():
        raise RuntimeError(f"Artifact file missing before upload: {local_path}")

    data = local_path.read_bytes()
    artifact["size_bytes"] = len(data)
    artifact["source_hash"] = hashlib.sha256(data).hexdigest()

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

def register_artifacts(request: dict, artifacts: list[dict]) -> list[dict]:
    registered = []
    for artifact in artifacts:
        upload_artifact_to_storage(artifact)
        registered.append(register_artifact(request, artifact))
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
        upload_artifact_to_storage(artifact)
        registered.append(register_artifact(request, artifact))
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

def rpc(name: str, payload: dict):
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
        with urllib.request.urlopen(req, timeout=45) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"RPC {name} failed: HTTP {exc.code} {detail}") from exc

def one(row_or_rows):
    if isinstance(row_or_rows, list):
        return row_or_rows[0] if row_or_rows else None
    return row_or_rows

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

    try:
        profile = get_profile(request["company_id"])
        if not profile:
            raise RuntimeError("No FEDEX automation profile returned.")

        if profile.get("status") != "HEALTHY":
            raise RuntimeError(f"FedEx credentials are not verified healthy. status={profile.get('status')}")

        credential = get_credential(profile["id"])
        if not credential or not credential.get("username") or not credential.get("encrypted_secret"):
            raise RuntimeError("No usable FedEx credential returned.")

        update_status(request_id, "RUNNING")

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
        child_env["FCMS_MANIFEST_TYPES"] = ",".join(manifest_options["manifest_types"])
        child_env["FCMS_SKIP_COMBINED"] = "1" if manifest_options["skip_combined"] else "0"

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
        assert proc.stdout is not None
        for line in proc.stdout:
            print(line, end="")
            if "[runner] section exit" in line or "[runner] governed date exit" in line:
                registered.extend(register_new_artifacts(
                    request,
                    run_started_at,
                    registered_paths,
                    segment_started_at,
                ))
                segment_started_at = time.time()
        return_code = proc.wait()
        elapsed_ms = int((time.time() - started) * 1000)
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

if __name__ == "__main__":
    raise SystemExit(main())

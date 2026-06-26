#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
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

def service_date_folder(service_date: str | None) -> str:
    if not service_date:
        return time.strftime("%m-%d-%Y")
    yyyy, mm, dd = service_date.split("-")
    return f"{mm}-{dd}-{yyyy}"

def infer_report_identity(filename: str) -> dict:
    name = filename.lower()

    if "daily service worksheet" in name:
        return {"report_family_key": "DSW", "report_shape_key": "DSW_DAILY_SERVICE_WORKSHEET", "report_frame": None, "display_filename": "Daily Service Worksheet.xlsx"}
    if "serviceareasummary" in name or "sasummary" in name:
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Service Area Summary.xlsx"}
    if "serviceareastatus" in name or "sastatus" in name:
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Work Area Summary.xlsx"}
    if "combinedmanifest" in name or name.startswith("cm_"):
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Combined Manifest.xlsx"}
    if "deliverymanifest" in name:
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Delivery Manifest.xlsx"}
    if "pickupmanifest" in name or name.startswith("pm"):
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Pickup Manifest.xlsx"}
    if "pickupassignments" in name or name.startswith("pa"):
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Pickup Assignments.xlsx"}
    if "reorderpulistings" in name or name.startswith("rpl"):
        return {"report_family_key": "FCC", "report_shape_key": None, "report_frame": None, "display_filename": "Reorder PU Listings.xlsx"}

    return {"report_family_key": None, "report_shape_key": None, "report_frame": None, "display_filename": filename}

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
    service_date = request.get("service_date") or time.strftime("%Y-%m-%d")
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

    return sections

def artifact_matches_targets(request: dict, artifact: dict) -> bool:
    keys = target_artifact_keys(request)
    if not keys:
        return True

    filename = str(artifact.get("filename") or "").lower()
    display = str(artifact.get("display_filename") or "").lower()

    if "DSW" in keys and "daily service worksheet" in display:
        return True
    if "SERVICE_AREA_SUMMARY" in keys and "serviceareasummary" in filename:
        return True
    if "WORK_AREA_SUMMARY" in keys and "serviceareastatus" in filename:
        return True
    if "SERVICE_AREA_STATUS" in keys and "serviceareastatus" in filename:
        return True
    if "COMBINED_MANIFEST" in keys and "combinedmanifest" in filename:
        return True
    if "DELIVERY_MANIFEST" in keys and "deliverymanifest" in filename:
        return True
    if "PICKUP_MANIFEST" in keys and "pickupmanifest" in filename:
        return True

    return False

def collect_artifacts(request: dict) -> list[dict]:
    folder_name = service_date_folder(request.get("service_date"))
    excel_dir = SCRAPER_HOME / "Excels" / folder_name
    artifacts = []

    if excel_dir.exists():
        for file in sorted(excel_dir.iterdir()):
            if file.is_file():
                identity = infer_report_identity(file.name)
                artifact = {
                    "kind": "REPORT_FILE",
                    "path": str(file),
                    "filename": file.name,
                    "size_bytes": file.stat().st_size,
                    "content_type": "application/vnd.ms-excel" if file.suffix.lower() == ".xls" else "application/octet-stream",
                    **identity,
                }
                if not artifact_matches_targets(request, artifact):
                    continue
                artifact["storage_bucket"] = "local-runner-artifacts"
                artifact["storage_path"] = local_storage_path(request, artifact)
                artifacts.append(artifact)

    logs_dir = SCRAPER_HOME / "Logs"
    if logs_dir.exists():
        for file in sorted(logs_dir.glob("daily_scraper_*.log"), key=lambda p: p.stat().st_mtime, reverse=True)[:3]:
            artifact = {
                "kind": "RUNTIME_LOG",
                "path": str(file),
                "filename": file.name,
                "display_filename": "Scraper Log.txt",
                "size_bytes": file.stat().st_size,
                "content_type": "text/plain",
                "report_family_key": None,
                "report_shape_key": None,
                "report_frame": None,
            }
            artifact["storage_bucket"] = "local-runner-artifacts"
            artifact["storage_path"] = local_storage_path(request, artifact)
            artifacts.append(artifact)

    return artifacts

def register_artifact(request: dict, artifact: dict) -> dict:
    return rpc("register_operations_collection_artifact", {
        "p_collection_request_id": request["id"],
        "p_company_id": request["company_id"],
        "p_service_date": request.get("service_date"),
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
        "p_source_hash": None,
        "p_runner_key": RUNNER_KEY,
        "p_runner_artifact_json": artifact,
    })

def register_artifacts(request: dict, artifacts: list[dict]) -> list[dict]:
    registered = []
    for artifact in artifacts:
        registered.append(register_artifact(request, artifact))
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

        child_env = os.environ.copy()
        child_env["FCMS_FEDEX_USERNAME"] = credential["username"]
        child_env["FCMS_FEDEX_PASSWORD"] = credential["encrypted_secret"]
        child_env["FCMS_REQUEST_ID"] = request_id
        child_env["FCMS_COMPANY_ID"] = request["company_id"]
        child_env["FCMS_COMPANY_SLUG"] = request.get("company_slug") or ""
        child_env["FCMS_SERVICE_DATE"] = request.get("service_date") or ""
        child_env["FCMS_COLLECTION_SCOPE"] = (request.get("request_payload") or {}).get("collect_scope") or ""
        child_env["FCMS_TARGET_SECTIONS"] = ",".join(target_runner_sections(request))
        child_env["FCMS_TARGET_ARTIFACT_KEYS"] = ",".join(sorted(target_artifact_keys(request)))

        print("[insight-runner] ready to execute donor runner")
        if os.environ.get("INSIGHT_RUNNER_DRY_RUN", "1") == "1":
            print("[insight-runner] dry run only; scraper not executed")
            artifacts = collect_artifacts(request)
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
        proc = subprocess.run(
            [str(DONOR_RUNNER)],
            cwd=str(APP_DIR),
            env=child_env,
            text=True,
        )
        elapsed_ms = int((time.time() - started) * 1000)
        print(f"[insight-runner] donor exit={proc.returncode} elapsed_ms={elapsed_ms}")

        artifacts = collect_artifacts(request)
        registered = register_artifacts(request, artifacts)
        print(json.dumps({
            "event": "artifact_manifest",
            "dry_run": False,
            "donor_exit_code": proc.returncode,
            "artifact_count": len(artifacts),
            "registered_count": len(registered),
            "artifacts": artifacts,
        }, indent=2))

        if proc.returncode != 0:
            if registered:
                update_status(
                    request_id,
                    "ARTIFACTS_READY",
                    f"Donor runner failed with exit code {proc.returncode}; partial artifacts registered."
                )
                return 0

            update_status(request_id, "FAILED", f"Donor runner failed with exit code {proc.returncode}")
            return proc.returncode

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

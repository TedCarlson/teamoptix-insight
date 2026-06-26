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

    if not request:
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

        print("[insight-runner] ready to execute donor runner")
        if os.environ.get("INSIGHT_RUNNER_DRY_RUN", "1") == "1":
            print("[insight-runner] dry run only; scraper not executed")
            update_status(request_id, "COMPLETE")
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

        if proc.returncode != 0:
            update_status(request_id, "FAILED", f"Donor runner failed with exit code {proc.returncode}")
            return proc.returncode

        update_status(request_id, "COMPLETE")
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

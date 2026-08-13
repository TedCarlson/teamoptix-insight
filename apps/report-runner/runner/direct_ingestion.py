"""Runner 2.0 single-artifact handoff client.

The runner supplies tenant and source-lane context. The application ingestion
pipeline remains authoritative for workbook identity, validation, and loading.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any
from pathlib import Path


HANDOFF_CONTRACT = "operations_artifact_handoff_v2"
RUNNER_VERSION = "continuous-runner-v2"
MAX_DIRECT_BYTES = 4_000_000


def enabled(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _filename_segment(value: str, fallback: str) -> str:
    return "-".join(
        part for part in "".join(
            character.lower() if character.isalnum() else "-"
            for character in value
        ).split("-") if part
    ) or fallback


def transport_filename(
    company_slug: str,
    requested_service_date: str,
    source_lane: str,
    declared_artifact_type: str,
    artifact_id: str,
    source_filename: str,
) -> str:
    tenant = _filename_segment(company_slug, "unknown-company")
    lane = _filename_segment(source_lane, "unknown-lane")
    artifact_type = _filename_segment(declared_artifact_type, "unknown-type")
    extension = Path(source_filename).suffix.lower() or ".bin"
    return (
        f"{tenant}__{requested_service_date}__{lane}__{artifact_type}__"
        f"{artifact_id}{extension}"
    )


def derive_endpoint(configured: str | None, legacy_endpoint: str | None) -> str | None:
    if configured:
        return configured.strip()
    if not legacy_endpoint:
        return None
    parsed = urllib.parse.urlsplit(legacy_endpoint.strip())
    if not parsed.scheme or not parsed.netloc:
        return None
    return urllib.parse.urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            "/api/runner/v2/artifacts/ingest",
            "",
            "",
        )
    )


def artifact_metadata(request: dict[str, Any], artifact: dict[str, Any]) -> dict[str, Any]:
    source_filename = str(
        artifact.get("source_download_filename")
        or artifact.get("filename")
        or "artifact"
    )
    runner_json = {
        key: value
        for key, value in artifact.items()
        if key not in {"path", "storage_bucket", "storage_path"}
    }
    return {
        "contract": HANDOFF_CONTRACT,
        "artifact_id": artifact["artifact_id"],
        "collection_request_id": request["id"],
        "company_id": request["company_id"],
        "company_slug": request["company_slug"],
        "runner_key": request["runner_key"],
        "requested_service_date": artifact.get("service_date")
        or request.get("service_date"),
        "source_lane": artifact.get("lane_key") or "UNKNOWN",
        "source_filename": source_filename,
        "transport_filename": artifact.get("transport_filename")
        or artifact.get("filename"),
        "artifact_key": artifact.get("artifact_key") or "UNKNOWN",
        "report_family_key": artifact.get("report_family_key") or "UNKNOWN",
        "report_shape_key": artifact.get("report_shape_key"),
        "report_frame": artifact.get("report_frame"),
        "content_type": artifact.get("content_type")
        or "application/octet-stream",
        "size_bytes": artifact["size_bytes"],
        "source_hash": artifact["source_hash"],
        "runner_artifact_json": runner_json,
    }


def encode_metadata(metadata: dict[str, Any]) -> str:
    payload = json.dumps(metadata, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


class DirectIngestionClient:
    def __init__(self, endpoint: str, token: str, timeout_seconds: float = 25.0):
        self.endpoint = endpoint
        self.token = token
        self.timeout_seconds = timeout_seconds

    def ingest(
        self,
        request: dict[str, Any],
        artifact: dict[str, Any],
        data: bytes,
    ) -> dict[str, Any]:
        if len(data) > MAX_DIRECT_BYTES:
            return {
                "ok": False,
                "durable": False,
                "fallback_required": True,
                "reason": "DIRECT_BODY_LIMIT",
            }

        metadata = artifact_metadata(request, artifact)
        http_request = urllib.request.Request(
            self.endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": artifact.get("content_type")
                or "application/octet-stream",
                "X-TeamOptix-Artifact-Metadata": encode_metadata(metadata),
                "X-TeamOptix-Runner-Version": RUNNER_VERSION,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(
                http_request,
                timeout=self.timeout_seconds,
            ) as response:
                raw = response.read().decode("utf-8")
                result = json.loads(raw) if raw else {}
                return {
                    **result,
                    "http_status": response.status,
                    "fallback_required": not bool(result.get("durable")),
                }
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", errors="ignore")
            try:
                detail = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                detail = {"error": raw[:500]}
            return {
                **detail,
                "ok": False,
                "durable": False,
                "fallback_required": True,
                "http_status": error.code,
            }
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            return {
                "ok": False,
                "durable": False,
                "fallback_required": True,
                "reason": type(error).__name__,
                "error": str(error)[:500],
            }

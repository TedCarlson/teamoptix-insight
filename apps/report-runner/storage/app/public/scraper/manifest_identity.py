"""Canonical manifest identity at the Runner download boundary.

FedEx reuses provider filenames across work areas.  A manifest is not ready for
handoff until its Header has been read and the local file has been named for
the Header-authoritative service date, work area, and manifest type.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path


MANIFEST_TOKENS = {
    "combined": "CombinedManifest",
    "delivery": "DeliveryManifest",
    "pickup": "PickupManifest",
}


def clean_text(value):
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "nat", "none"}:
        return ""
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def safe_component(value, fallback="UNKNOWN"):
    text = clean_text(value)
    if not text:
        return fallback
    text = re.sub(r"[^\w.-]+", "-", text, flags=re.UNICODE)
    return text.strip("._-") or fallback


def safe_manifest_label(value, fallback="UNKNOWN"):
    text = clean_text(value)
    if not text:
        return fallback
    text = re.sub(r"[^\w ,.-]+", "-", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip(" ._-")
    return text or fallback


def normalized_header_key(value):
    return re.sub(r"[^a-z0-9]+", "", clean_text(value).lower())


def normalize_service_date(value):
    text = clean_text(value)
    if not text:
        return ""

    for date_format in (
        "%Y-%m-%d",
        "%m-%d-%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%m/%d/%y",
    ):
        try:
            return datetime.strptime(text, date_format).strftime("%Y%m%d")
        except ValueError:
            pass

    try:
        # The Runner image already carries pandas/xlrd for FedEx .xls files.
        import pandas as pd

        return pd.to_datetime(text, errors="raise").strftime("%Y%m%d")
    except Exception:
        return ""


def normalize_route_key(value):
    match = re.search(r"(?<!\d)(\d{1,4})(?!\d)", clean_text(value))
    return str(int(match.group(1))) if match else ""


def route_label(value, route_key):
    text = clean_text(value)
    match = re.match(r"^(?:WA\s*#?\s*)?0*" + re.escape(route_key) + r"(?:\s+(.*))?$", text, re.I)
    return clean_text(match.group(1)) if match else ""


def infer_manifest_type(page_value):
    page = clean_text(page_value).lower()
    for manifest_type in MANIFEST_TOKENS:
        if manifest_type in page:
            return manifest_type
    return ""


def readHeaderIdentity(file_path):
    """Read the workbook Header without making its payload warehouse truth."""
    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError(
            "Manifest identification requires pandas in the Runner virtualenv."
        ) from exc

    path = Path(file_path)
    frame = pd.read_excel(
        path,
        sheet_name="Header",
        header=None,
        dtype=str,
    )
    values = {}
    for row in frame.itertuples(index=False, name=None):
        if not row:
            continue
        key = normalized_header_key(row[0] if len(row) > 0 else "")
        value = clean_text(row[1] if len(row) > 1 else "")
        if key and value and key not in values:
            values[key] = value

    page = (
        values.get("page")
        or values.get("manifesttype")
        or values.get("report")
        or ""
    )
    service_date_raw = values.get("servicedate") or values.get("date") or ""
    work_area = (
        values.get("wa")
        or values.get("wanumber")
        or values.get("workarea")
        or ""
    )
    return {
        "page": clean_text(page),
        "manifest_type": infer_manifest_type(page),
        "service_date_raw": clean_text(service_date_raw),
        "service_date_compact": normalize_service_date(service_date_raw),
        "service_area": clean_text(
            values.get("sa")
            or values.get("sanumber")
            or values.get("servicearea")
            or ""
        ),
        "work_area": clean_text(work_area),
        "route_key": normalize_route_key(work_area),
        "driver": clean_text(values.get("driver") or ""),
        "isp_ic": clean_text(
            values.get("ispic") or values.get("isp") or values.get("ic") or ""
        ),
        "vehicle": clean_text(values.get("vehicle") or ""),
    }


def canonicalManifestFilename(
    file_path,
    *,
    expected_type=None,
    selected_route_identity=None,
    selected_service_date=None,
):
    path = Path(file_path)
    identity = readHeaderIdentity(path)
    manifest_type = clean_text(identity.get("manifest_type")).lower()

    if manifest_type not in MANIFEST_TOKENS:
        raise RuntimeError(
            f"Unable to determine manifest type from Header: {path.name}"
        )

    if expected_type:
        expected_type = clean_text(expected_type).lower()
        if expected_type not in MANIFEST_TOKENS:
            raise RuntimeError(f"Unsupported manifest type: {expected_type}")
        if manifest_type != expected_type:
            raise RuntimeError(
                "Manifest Header Page mismatch: "
                f"expected={expected_type} header={manifest_type} file={path.name}"
            )
        manifest_type = expected_type

    service_date = clean_text(identity.get("service_date_compact"))
    route_key = clean_text(identity.get("route_key")) or normalize_route_key(
        identity.get("work_area")
    )
    if not service_date:
        raise RuntimeError(f"Manifest Header has no usable service date: {path.name}")
    if not route_key:
        raise RuntimeError(f"Manifest Header has no usable WA route: {path.name}")

    selected_route_key = normalize_route_key(selected_route_identity)
    if selected_route_key and selected_route_key != route_key:
        raise RuntimeError(
            "Manifest route mismatch: "
            f"selected={selected_route_key} header={route_key} file={path.name}"
        )

    selected_date = normalize_service_date(selected_service_date)
    if selected_date and selected_date != service_date:
        raise RuntimeError(
            "Manifest service-date mismatch: "
            f"selected={selected_date} header={service_date} file={path.name}"
        )

    route_component = route_key.zfill(4)
    service_area = safe_component(identity.get("service_area"), "NO-SA")
    token = MANIFEST_TOKENS[manifest_type]
    extension = path.suffix.lower() or ".xls"
    if manifest_type == "delivery":
        label = safe_manifest_label(
            route_label(identity.get("work_area"), route_key),
            f"WA {route_key}",
        )
        filename = f"{service_date}_{route_component} {label}{extension}"
    elif manifest_type == "pickup":
        filename = f"PM{service_date}_{service_area}_{route_component}{extension}"
    else:
        filename = (
            f"{token}_{service_date}_SA_{service_area}_WA_{route_component}"
            f"{extension}"
        )

    identity.update({
        "manifest_type": manifest_type,
        "route_key": route_key,
        "canonical_filename": filename,
    })
    return filename, identity


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def writeRunnerMetadata(target_path, metadata):
    sidecar = Path(f"{target_path}.runner.json")
    temporary = Path(f"{sidecar}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(metadata, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    os.replace(temporary, sidecar)


def renameDownloadedManifest(
    file_path,
    *,
    expected_type=None,
    selected_route_identity=None,
    selected_service_date=None,
):
    source = Path(file_path)
    if not source.is_file():
        raise RuntimeError(f"Downloaded manifest does not exist: {source}")

    source_filename = source.name
    canonical_filename, identity = canonicalManifestFilename(
        source,
        expected_type=expected_type,
        selected_route_identity=selected_route_identity,
        selected_service_date=selected_service_date,
    )
    target = source.with_name(canonical_filename)
    source_hash = sha256_file(source)

    # The canonical route/day/type path is the latest collected workbook.
    if source.resolve() != target.resolve():
        os.replace(source, target)

    metadata = {
        **identity,
        "source_download_filename": source_filename,
        "canonical_filename": target.name,
        "source_hash": source_hash,
        "header_authoritative": True,
        "identity_authority": "MANIFEST_HEADER",
    }
    writeRunnerMetadata(target, metadata)
    return str(target), metadata


def quarantineRejectedManifest(file_path, error):
    """Preserve invalid bytes while keeping them out of artifact discovery."""
    source = Path(file_path)
    if not source.is_file():
        return None
    source_hash = sha256_file(source)
    quarantine_folder = source.parent / "RejectedManifestDownloads"
    quarantine_folder.mkdir(mode=0o700, exist_ok=True)
    target = quarantine_folder / (
        f"{source.name}.rejected-{source_hash[:12]}"
    )
    if source.resolve() != target.resolve():
        os.replace(source, target)
    writeRunnerMetadata(
        target,
        {
            "artifact_status": "REJECTED_BEFORE_HANDOFF",
            "source_download_filename": source.name,
            "source_hash": source_hash,
            "identity_authority": "MANIFEST_HEADER",
            "error": str(error)[:500],
        },
    )
    return str(target)

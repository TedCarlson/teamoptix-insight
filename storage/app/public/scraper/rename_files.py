import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


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

    # Excel sometimes exposes whole-number identifiers as "123.0".
    if re.fullmatch(r"\d+\.0", text):
        text = text[:-2]

    return text


def safe_component(value, fallback="UNKNOWN"):
    text = clean_text(value)
    if not text:
        return fallback

    text = re.sub(r"[^\w .-]+", "-", text, flags=re.UNICODE)
    text = re.sub(r"\s+", "-", text).strip("._-")

    return text or fallback


def normalized_header_key(value):
    return re.sub(r"[^a-z0-9]+", "", clean_text(value).lower())


def normalize_service_date(value):
    text = clean_text(value)
    if not text:
        return ""

    candidates = [
        "%Y-%m-%d",
        "%m-%d-%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%m/%d/%y",
    ]

    for date_format in candidates:
        try:
            return datetime.strptime(text, date_format).strftime("%Y%m%d")
        except ValueError:
            pass

    try:
        parsed = pd.to_datetime(text, errors="raise")
        return parsed.strftime("%Y%m%d")
    except Exception:
        return ""


def infer_manifest_type(page_value):
    page = clean_text(page_value).lower()

    if "combined" in page:
        return "combined"

    if "delivery" in page:
        return "delivery"

    if "pickup" in page:
        return "pickup"

    return ""


def readHeaderIdentity(file_path):
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
        if not key:
            continue

        value = clean_text(row[1] if len(row) > 1 else "")

        if value and key not in values:
            values[key] = value

    page = (
        values.get("page")
        or values.get("manifesttype")
        or values.get("report")
        or ""
    )

    service_date_raw = (
        values.get("servicedate")
        or values.get("date")
        or ""
    )

    identity = {
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
        "work_area": clean_text(
            values.get("wa")
            or values.get("wanumber")
            or values.get("workarea")
            or ""
        ),
        "driver": clean_text(values.get("driver") or ""),
        "isp_ic": clean_text(
            values.get("ispic")
            or values.get("isp")
            or values.get("ic")
            or ""
        ),
        "vehicle": clean_text(values.get("vehicle") or ""),
    }

    return identity


def canonicalManifestFilename(file_path, expected_type=None):
    path = Path(file_path)
    identity = readHeaderIdentity(path)

    manifest_type = identity.get("manifest_type") or ""

    if expected_type:
        expected_type = clean_text(expected_type).lower()

        if expected_type not in MANIFEST_TOKENS:
            raise RuntimeError(
                f"Unsupported expected manifest type: {expected_type}"
            )

        if manifest_type and manifest_type != expected_type:
            raise RuntimeError(
                "Manifest Header Page mismatch: "
                f"expected={expected_type} "
                f"header={manifest_type} "
                f"file={path.name}"
            )

        manifest_type = expected_type

    if manifest_type not in MANIFEST_TOKENS:
        raise RuntimeError(
            f"Unable to determine manifest type from Header: {path.name}"
        )

    service_date = identity.get("service_date_compact")
    service_area = identity.get("service_area")
    work_area = identity.get("work_area")

    if not service_date:
        raise RuntimeError(
            f"Manifest Header is missing a usable service date: {path.name}"
        )

    if not service_area:
        raise RuntimeError(
            f"Manifest Header is missing SA#: {path.name}"
        )

    if not work_area:
        raise RuntimeError(
            f"Manifest Header is missing WA#: {path.name}"
        )

    token = MANIFEST_TOKENS[manifest_type]
    extension = path.suffix or ".xls"

    filename = (
        f"{token}_"
        f"{safe_component(service_date)}_"
        f"SA_{safe_component(service_area)}_"
        f"WA_{safe_component(work_area)}"
        f"{extension}"
    )

    identity["manifest_type"] = manifest_type
    identity["canonical_filename"] = filename

    return filename, identity


def sha256_file(path):
    digest = hashlib.sha256()

    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def writeRunnerMetadata(target_path, metadata):
    sidecar = Path(f"{target_path}.runner.json")
    temporary = Path(f"{sidecar}.tmp")

    temporary.write_text(
        json.dumps(metadata, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    os.replace(temporary, sidecar)


def renameDownloadedManifest(file_path, expected_type=None):
    source = Path(file_path)

    if not source.exists() or not source.is_file():
        raise RuntimeError(f"Downloaded manifest does not exist: {source}")

    source_filename = source.name
    canonical_filename, identity = canonicalManifestFilename(
        source,
        expected_type=expected_type,
    )

    target = source.with_name(canonical_filename)
    source_hash = sha256_file(source)

    if target.exists() and target.resolve() != source.resolve():
        target_hash = sha256_file(target)

        if target_hash == source_hash:
            source.unlink()
        else:
            collision_name = (
                f"{target.stem}_HASH_{source_hash[:8]}{target.suffix}"
            )
            target = target.with_name(collision_name)
            os.replace(source, target)
    elif target.resolve() != source.resolve():
        os.replace(source, target)

    metadata = {
        **identity,
        "source_download_filename": source_filename,
        "canonical_filename": target.name,
        "source_hash": source_hash,
        "header_authoritative": True,
    }

    writeRunnerMetadata(target, metadata)

    return str(target), metadata


def openExel(date_str, file, date_only=False):
    if date_only:
        date = datetime.strptime(date_str, "%m-%d-%Y")
        return date.strftime("%Y%m%d")

    identity = readHeaderIdentity(file)

    service_date = identity.get("service_date_compact")
    if not service_date:
        date = datetime.strptime(date_str, "%m-%d-%Y")
        service_date = date.strftime("%Y%m%d")

    ret = service_date

    if identity.get("work_area"):
        ret += "_" + identity["work_area"]

    if identity.get("service_area"):
        ret += "_" + identity["service_area"]

    return ret


def renameFile(folder_name, file, path):
    source = Path(path) / file

    if (
        not source.exists()
        or not source.is_file()
        or file.startswith(".~lock")
        or file.endswith(".runner.json")
    ):
        return True

    try:
        compact_name = re.sub(r"[^a-z0-9]+", "", file.lower())

        if "deliverymanifest" in compact_name:
            renameDownloadedManifest(source, expected_type="delivery")
            return True

        if "combinedmanifest" in compact_name:
            renameDownloadedManifest(source, expected_type="combined")
            return True

        if "pickupmanifest" in compact_name:
            renameDownloadedManifest(source, expected_type="pickup")
            return True

        _, ext = os.path.splitext(file)

        if "ServiceAreaStatus" in file:
            name = "SAStatus_" + openExel(
                folder_name,
                source,
                True,
            ) + ext
        elif "ServiceAreaSummary" in file:
            name = "SASummary_" + openExel(
                folder_name,
                source,
                True,
            ) + ext
        elif "PickupAssignments" in file:
            name = "PA" + openExel(folder_name, source) + ext
        elif "ReorderPUListings" in file:
            name = "RPL" + openExel(folder_name, source) + ext
        else:
            return True

        target = source.with_name(name)

        if target.exists() and target.resolve() != source.resolve():
            if sha256_file(target) == sha256_file(source):
                source.unlink()
                return True

            target = target.with_name(
                f"{target.stem}_HASH_{sha256_file(source)[:8]}{target.suffix}"
            )

        os.replace(source, target)
        return True

    except Exception as exc:
        print(exc)
        return False


def renameFolder(path):
    folder_name = os.path.basename(path)
    print(folder_name)

    success = True

    for file in os.listdir(path):
        success = renameFile(folder_name, file, path) and success

    return success


if __name__ == "__main__":
    try:
        if len(os.sys.argv) > 2 and os.sys.argv[1] == "bulk":
            directory = os.sys.argv[2]

            if os.path.exists(directory):
                print("Bulk rename in progress...")

                for folder in os.listdir(directory):
                    full_path = os.path.join(directory, folder)

                    if os.path.isdir(full_path):
                        renameFolder(full_path)

    except Exception as exc:
        print(exc)

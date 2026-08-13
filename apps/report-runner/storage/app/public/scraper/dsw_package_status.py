"""Optional DSW All Status Code Packages discovery and download lane."""

import json
import logging
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from selenium.webdriver.support.ui import WebDriverWait

from runtime_events import emit_runtime_event


ARTIFACT_KEY = "DSW_ALL_STATUS_CODE_PACKAGES"
LANE_KEY = "DSW_PACKAGE_STATUS"
DAILY_SERVICE_ARTIFACT_KEY = "DSW_DAILY_SERVICE"
DAILY_SERVICE_LANE_KEY = "DSW"
OPTIONAL_SOURCE_UI_TIMEOUT_SECONDS = 8
OPTIONAL_DOWNLOAD_TIMEOUT_SECONDS = 20


def retain_latest_daily_service_workbook(
    downloaded_path,
    download_folder,
):
    """Keep one canonical DSW workbook for the current service date."""

    source = Path(downloaded_path)
    folder = Path(download_folder)
    target = folder / f"daily service worksheet{source.suffix.lower()}"
    daily_service_pattern = re.compile(
        r"^daily service worksheet(?: \(\d+\))?\.(?:xls|xlsx)$",
        re.IGNORECASE,
    )

    for candidate in folder.iterdir():
        if (
            not candidate.is_file()
            or not daily_service_pattern.fullmatch(candidate.name)
            or candidate.resolve() == source.resolve()
        ):
            continue
        candidate.unlink()
        sidecar = Path(f"{candidate}.runner.json")
        if sidecar.exists():
            sidecar.unlink()

    if source.resolve() != target.resolve():
        if target.exists():
            target.unlink()
        os.replace(source, target)

    return str(target)


def purge_expired_local_package_artifacts(
    excels_folder,
    *,
    today=None,
    retention_days=7,
):
    """Delete only expired package-detail workbooks and their sidecars."""

    effective_today = today or date.today()
    cutoff = effective_today - timedelta(days=retention_days)
    deleted_count = 0

    try:
        for folder in Path(excels_folder).iterdir():
            if not folder.is_dir():
                continue
            try:
                service_date = datetime.strptime(
                    folder.name,
                    "%m-%d-%Y",
                ).date()
            except ValueError:
                continue
            if service_date > cutoff:
                continue

            for path in folder.iterdir():
                name = path.name.lower()
                is_package_workbook = (
                    path.is_file()
                    and name.startswith("packageleveldetails")
                    and path.suffix.lower() in {".xls", ".xlsx"}
                )
                is_package_sidecar = (
                    path.is_file()
                    and name.startswith("packageleveldetails")
                    and name.endswith((".xls.runner.json", ".xlsx.runner.json"))
                )
                if is_package_workbook or is_package_sidecar:
                    path.unlink()
                    deleted_count += 1

        if deleted_count:
            emit_runtime_event(
                "LOCAL_RETENTION_COMPLETED",
                "RETENTION",
                artifact_key=ARTIFACT_KEY,
                lane_key=LANE_KEY,
                metadata={
                    "deleted_file_count": deleted_count,
                    "retention_days": retention_days,
                    "cutoff_service_date": cutoff.isoformat(),
                },
            )
    except Exception as error:
        logging.info(
            "Optional local package-status retention failed: %s",
            error,
        )
        emit_runtime_event(
            "NEEDS_ATTENTION",
            "RETENTION",
            artifact_key=ARTIFACT_KEY,
            lane_key=LANE_KEY,
            metadata={
                "reason": "LOCAL_RETENTION_FAILED",
                "error_type": type(error).__name__,
                "retry_policy": "NEXT_COLLECTION",
                "cycle_blocking": False,
            },
        )

    return deleted_count


def download_snapshot(download_folder):
    snapshot = {}
    for filename in os.listdir(download_folder):
        path = os.path.join(download_folder, filename)
        if (
            not os.path.isfile(path)
            or filename.startswith(".")
            or os.path.splitext(path)[1].lower() not in {".xls", ".xlsx"}
        ):
            continue
        stat = os.stat(path)
        snapshot[str(os.path.realpath(path))] = (
            stat.st_mtime_ns,
            stat.st_size,
        )
    return snapshot


def wait_for_completed_download(
    download_folder,
    before,
    timeout_seconds=60,
):
    deadline = time.time() + timeout_seconds
    last_sizes = {}
    first_seen_at = None

    while time.time() < deadline:
        active_downloads = [
            filename
            for filename in os.listdir(download_folder)
            if filename.endswith(".crdownload")
        ]
        candidates = []

        for filename in os.listdir(download_folder):
            path = os.path.join(download_folder, filename)
            real_path = str(os.path.realpath(path))
            if (
                os.path.isfile(path)
                and not filename.startswith(".")
                and os.path.splitext(filename)[1].lower()
                in {".xls", ".xlsx"}
            ):
                stat = os.stat(path)
                fingerprint = (stat.st_mtime_ns, stat.st_size)
                if real_path not in before or before[real_path] != fingerprint:
                    candidates.append(path)

        if candidates and first_seen_at is None:
            first_seen_at = time.time()

        candidates.sort(key=os.path.getmtime, reverse=True)
        for candidate in candidates:
            size = os.path.getsize(candidate)
            if size > 0 and last_sizes.get(candidate) == size:
                return candidate, first_seen_at or time.time()
            last_sizes[candidate] = size

        time.sleep(0.5 if not active_downloads and candidates else 0.25)

    raise RuntimeError(
        "Timed out waiting for the DSW package-status Excel download."
    )


def discover_dsw_package_status(driver):
    return driver.execute_script(
        r"""
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const tables = Array.from(document.querySelectorAll("table"));

for (const table of tables) {
  const tableRows = Array.from(table.querySelectorAll("tr"));
  const grid = [];
  const origins = new Map();

  tableRows.forEach((row, rowIndex) => {
    grid[rowIndex] = grid[rowIndex] || [];
    let columnIndex = 0;
    const cells = Array.from(row.children).filter((cell) =>
      ["TD", "TH"].includes(cell.tagName)
    );

    cells.forEach((cell) => {
      while (grid[rowIndex][columnIndex]) columnIndex += 1;
      const rowSpan = Math.max(1, Number(cell.rowSpan || 1));
      const columnSpan = Math.max(1, Number(cell.colSpan || 1));
      origins.set(cell, { rowIndex, columnIndex });

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        grid[rowIndex + rowOffset] = grid[rowIndex + rowOffset] || [];
        for (
          let columnOffset = 0;
          columnOffset < columnSpan;
          columnOffset += 1
        ) {
          grid[rowIndex + rowOffset][columnIndex + columnOffset] = cell;
        }
      }
      columnIndex += columnSpan;
    });
  });

  for (const [headerCell, origin] of origins.entries()) {
    if (normalize(headerCell.innerText) !== "All Status Code Pkgs") continue;

    const contractFooters = [];
    const colocationFooters = [];
    for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex += 1) {
      const rowText = normalize(tableRows[rowIndex].innerText);
      const contractMatch = rowText.match(/Contract\s+(C\d+)\s+Total/i);
      const isColocationTotal = /\bColocation\s+Total(?:\s+WE)?\b/i.test(
        rowText
      );
      if (!contractMatch && !isColocationTotal) continue;

      const targetCell =
        grid[rowIndex] && grid[rowIndex][origin.columnIndex];
      if (!targetCell) continue;
      // FedEx binds the drill-down handler with page JavaScript to a bare
      // anchor. Footer rows have merged leading cells, so intersect the
      // header's expanded visual-grid column with each eligible footer row;
      // raw DOM cell indexes do not line up.
      const link = targetCell.querySelector("a");
      const candidate = {
        link: link || null,
        footer_scope: contractMatch ? "CONTRACT_TOTAL" : "COLOCATION_TOTAL",
        contract_number: contractMatch
          ? contractMatch[1].toUpperCase()
          : null,
      };
      (contractMatch ? contractFooters : colocationFooters).push(candidate);
    }

    // Prefer company-specific Contract Total evidence when offered. The DSW
    // can instead expose the only live All Codes link on the shifted
    // Colocation Total footer, especially early in sort, so retain that as the
    // navigation fallback and leave payload authority to ingestion.
    const selected =
      contractFooters.find((candidate) => candidate.link) ||
      colocationFooters.find((candidate) => candidate.link) ||
      null;
    if (selected) return { status: "FOUND", ...selected };

    return {
      status: "SOURCE_NOT_OFFERED",
      reason: "ALL_CODES_FOOTER_LINK_NOT_OFFERED",
      footer_candidates: contractFooters.length + colocationFooters.length,
      link: null,
    };
  }
}

return {
  status: "SOURCE_NOT_OFFERED",
  reason: "ALL_CODES_COLUMN_NOT_FOUND",
  link: null,
};
"""
    )


def find_package_status_excel_control(driver):
    return driver.execute_script(
        r"""
const normalize = (value) => String(value || "").toLowerCase();
const controls = Array.from(document.querySelectorAll("img")).map((image) => {
  const clickable = image.closest("a, button, input") || image;
  const semantic = [
    image.alt,
    image.title,
    image.src,
    clickable.getAttribute("href"),
    clickable.getAttribute("onclick"),
    clickable.getAttribute("title"),
    clickable.getAttribute("aria-label"),
  ].map(normalize).join(" ");
  return { image, clickable, semantic };
});
const explicit = controls.find(({ semantic }) =>
  /(excel|spreadsheet|\.xls|xlsx)/.test(semantic)
);
if (explicit) return explicit.clickable;
const nonPdf = controls.filter(({ semantic, image }) =>
  image.classList.contains("downloadIcon") && !/(pdf)/.test(semantic)
);
return nonPdf.length === 1 ? nonPdf[0].clickable : null;
"""
    )


def find_daily_service_excel_control(driver):
    return driver.execute_script(
        r"""
const normalize = (value) => String(value || "").toLowerCase();
const controls = Array.from(document.querySelectorAll("img")).map((image) => {
  const clickable = image.closest("a, button, input") || image;
  const semantic = [
    image.alt,
    image.title,
    image.src,
    clickable.getAttribute("href"),
    clickable.getAttribute("onclick"),
    clickable.getAttribute("title"),
    clickable.getAttribute("aria-label"),
  ].map(normalize).join(" ");
  return { image, clickable, semantic };
});
const explicit = controls.find(({ semantic }) =>
  /(excel|spreadsheet|\.xls|xlsx)/.test(semantic) && !/(pdf)/.test(semantic)
);
if (explicit) return explicit.clickable;
const nonPdf = controls.filter(({ semantic, image }) =>
  image.classList.contains("downloadIcon") && !/(pdf)/.test(semantic)
);
return nonPdf.length === 1 ? nonPdf[0].clickable : null;
"""
    )


def collect_dsw_daily_service(
    driver,
    *,
    download_folder,
    facility_identity,
):
    """Download the required DSW workbook using its Excel-specific control."""

    before_download = download_snapshot(download_folder)
    excel_control = WebDriverWait(driver, 60).until(
        lambda current_driver: find_daily_service_excel_control(
            current_driver
        )
    )
    requested_at = time.time()
    driver.execute_script("arguments[0].click();", excel_control)
    downloaded_path, source_ready_at = wait_for_completed_download(
        download_folder,
        before_download,
    )
    downloaded_path = retain_latest_daily_service_workbook(
        downloaded_path,
        download_folder,
    )
    filename = os.path.basename(downloaded_path)
    write_runner_metadata(
        downloaded_path,
        {
            "artifact_key": DAILY_SERVICE_ARTIFACT_KEY,
            "report_family_key": "DSW",
            "report_shape_key": "DSW_DAILY_SERVICE_WORKSHEET",
            "declared_artifact_type": "daily_service",
            "source_download_filename": filename,
            "collection_context": {
                "selected_facility": facility_identity,
                "source_lane": DAILY_SERVICE_LANE_KEY,
            },
            "payload_authority": "INGESTION_PIPELINE",
        },
    )
    event_common = {
        "artifact_key": DAILY_SERVICE_ARTIFACT_KEY,
        "lane_key": DAILY_SERVICE_LANE_KEY,
        "filename": filename,
        "metadata": {
            "facility_identity": facility_identity,
        },
    }
    emit_runtime_event(
        "SOURCE_REQUESTED",
        "SOURCE",
        occurred_at=datetime.fromtimestamp(
            requested_at,
            timezone.utc,
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "SOURCE_READY",
        "SOURCE",
        occurred_at=datetime.fromtimestamp(
            source_ready_at,
            timezone.utc,
        ).isoformat().replace("+00:00", "Z"),
        **event_common,
    )
    emit_runtime_event(
        "DOWNLOAD_COMPLETED",
        "DOWNLOAD",
        **event_common,
    )
    return downloaded_path


def write_runner_metadata(path, metadata):
    sidecar_path = path + ".runner.json"
    temporary_path = sidecar_path + f".{os.getpid()}.tmp"
    with open(temporary_path, "w", encoding="utf-8") as sidecar:
        json.dump(metadata, sidecar, sort_keys=True)
    os.replace(temporary_path, sidecar_path)


def _emit_attention(
    reason,
    facility_identity,
    *,
    event_stage="SOURCE_DISCOVERY",
    **metadata,
):
    emit_runtime_event(
        "NEEDS_ATTENTION",
        event_stage,
        artifact_key=ARTIFACT_KEY,
        lane_key=LANE_KEY,
        metadata={
            "reason": reason,
            "facility_identity": facility_identity,
            "retry_policy": "NEXT_COLLECTION",
            "cycle_blocking": False,
            **metadata,
        },
    )


def collect_dsw_package_status(
    driver,
    *,
    dsw_window_handle,
    download_folder,
    facility_identity,
    service_date,
):
    """Collect one optional package-detail workbook without raising."""

    detail_handle = None
    event_common = {
        "artifact_key": ARTIFACT_KEY,
        "lane_key": LANE_KEY,
    }

    try:
        discovery = discover_dsw_package_status(driver) or {}
        discovery_status = str(discovery.get("status") or "UNKNOWN")
        link = discovery.get("link")

        if discovery_status != "FOUND" or not link:
            source_reason = str(
                discovery.get("reason")
                or "EXPORT_CONTROL_NOT_AVAILABLE"
            )
            emit_runtime_event(
                "SOURCE_UNAVAILABLE",
                "SOURCE_DISCOVERY",
                metadata={
                    "reason": source_reason,
                    "facility_identity": facility_identity,
                    "source_contract_hint": discovery.get(
                        "contract_number"
                    ),
                    "footer_scope": discovery.get("footer_scope"),
                    "retry_policy": "NEXT_COLLECTION",
                    "cycle_blocking": False,
                },
                **event_common,
            )
            return {
                "status": "SOURCE_UNAVAILABLE",
                "reason": source_reason,
            }

        existing_handles = set(driver.window_handles)
        requested_at = time.time()
        driver.execute_script("arguments[0].click();", link)
        WebDriverWait(
            driver,
            OPTIONAL_SOURCE_UI_TIMEOUT_SECONDS,
        ).until(
            lambda current_driver: bool(
                set(current_driver.window_handles) - existing_handles
            )
        )
        detail_handle = next(
            handle
            for handle in driver.window_handles
            if handle not in existing_handles
        )
        driver.switch_to.window(detail_handle)

        excel_control = WebDriverWait(
            driver,
            OPTIONAL_SOURCE_UI_TIMEOUT_SECONDS,
        ).until(find_package_status_excel_control)

        before_download = download_snapshot(download_folder)
        driver.execute_script("arguments[0].click();", excel_control)
        downloaded_path, source_ready_at = wait_for_completed_download(
            download_folder,
            before_download,
            timeout_seconds=OPTIONAL_DOWNLOAD_TIMEOUT_SECONDS,
        )
        source_filename = os.path.basename(downloaded_path)
        extension = os.path.splitext(downloaded_path)[1].lower() or ".xls"
        transport_name = (
            f"PackageLevelDetails_{uuid.uuid4().hex}{extension}"
        )
        transport_path = os.path.join(download_folder, transport_name)
        os.replace(downloaded_path, transport_path)

        write_runner_metadata(
            transport_path,
            {
                "artifact_key": ARTIFACT_KEY,
                "report_family_key": "DSW",
                "report_shape_key": ARTIFACT_KEY,
                "declared_artifact_type": "all_status_code_packages",
                "source_download_filename": source_filename,
                "collection_context": {
                    "selected_facility": facility_identity,
                    "selected_service_date": service_date,
                    "source_lane": LANE_KEY,
                    "source_contract_hint": discovery.get(
                        "contract_number"
                    ),
                    "footer_scope": discovery.get("footer_scope"),
                },
                "payload_authority": "INGESTION_PIPELINE",
            },
        )

        emit_runtime_event(
            "SOURCE_REQUESTED",
            "SOURCE",
            occurred_at=datetime.fromtimestamp(
                requested_at, timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            filename=transport_name,
            metadata={
                "facility_identity": facility_identity,
                "selected_service_date": service_date,
                "footer_scope": discovery.get("footer_scope"),
            },
            **event_common,
        )
        emit_runtime_event(
            "SOURCE_READY",
            "SOURCE",
            occurred_at=datetime.fromtimestamp(
                source_ready_at, timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            filename=transport_name,
            **event_common,
        )
        emit_runtime_event(
            "DOWNLOAD_COMPLETED",
            "DOWNLOAD",
            filename=transport_name,
            **event_common,
        )
        return {
            "status": "COLLECTED",
            "filename": transport_name,
        }
    except Exception as error:
        logging.info(
            "Optional DSW package-status collection failed: %s",
            error,
        )
        emit_runtime_event(
            "DOWNLOAD_FAILED",
            "DOWNLOAD",
            artifact_key=ARTIFACT_KEY,
            lane_key=LANE_KEY,
            metadata={
                "reason": type(error).__name__,
                "message": str(error),
                "facility_identity": facility_identity,
                "retry_policy": "NEXT_COLLECTION",
                "cycle_blocking": False,
            },
        )
        return {"status": "DOWNLOAD_FAILED", "reason": str(error)}
    finally:
        try:
            if detail_handle and detail_handle in driver.window_handles:
                driver.switch_to.window(detail_handle)
                driver.close()
        except Exception:
            pass
        try:
            driver.switch_to.window(dsw_window_handle)
        except Exception:
            pass

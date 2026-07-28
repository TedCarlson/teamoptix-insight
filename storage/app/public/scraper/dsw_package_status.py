"""Optional DSW All Status Code Packages discovery and download lane."""

import json
import logging
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from runtime_events import emit_runtime_event


ARTIFACT_KEY = "DSW_ALL_STATUS_CODE_PACKAGES"
LANE_KEY = "DSW_PACKAGE_STATUS"


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
    return {
        str(os.path.realpath(path))
        for path in (
            os.path.join(download_folder, filename)
            for filename in os.listdir(download_folder)
        )
        if os.path.isfile(path)
        and not os.path.basename(path).startswith(".")
        and os.path.splitext(path)[1].lower() in {".xls", ".xlsx"}
    }


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
            if (
                os.path.isfile(path)
                and not filename.startswith(".")
                and os.path.splitext(filename)[1].lower()
                in {".xls", ".xlsx"}
                and str(os.path.realpath(path)) not in before
            ):
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

    for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex += 1) {
      const rowText = normalize(tableRows[rowIndex].innerText);
      const contractMatch = rowText.match(/Contract\s+(C\d+)\s+Total/i);
      if (!contractMatch) continue;

      const targetCell =
        grid[rowIndex] && grid[rowIndex][origin.columnIndex];
      if (!targetCell) {
        return {
          status: "INVALID_CELL",
          contract_number: contractMatch[1].toUpperCase(),
        };
      }

      const countText = normalize(targetCell.innerText);
      const countMatch = countText.replace(/,/g, "").match(/\d+/);
      // FedEx binds the drill-down handler with page JavaScript to a bare
      // anchor, so the clickable count may have neither href nor onclick.
      const link = targetCell.querySelector("a");
      const blankWithoutLink = !countText && !link;
      return {
        status: countMatch || blankWithoutLink ? "FOUND" : "INVALID_COUNT",
        contract_number: contractMatch[1].toUpperCase(),
        expected_package_count: countMatch ? Number(countMatch[0]) : 0,
        link: link || null,
      };
    }
  }
}

return { status: "HEADER_NOT_FOUND" };
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
        contract_number = str(
            discovery.get("contract_number") or ""
        ).strip().upper()
        expected_count = discovery.get("expected_package_count")
        link = discovery.get("link")

        if discovery_status != "FOUND":
            _emit_attention(
                discovery_status,
                facility_identity,
                contract_number=contract_number or None,
            )
            return {"status": "NEEDS_ATTENTION", "reason": discovery_status}

        if not isinstance(expected_count, int) or expected_count < 0:
            _emit_attention(
                "INVALID_COUNT",
                facility_identity,
                contract_number=contract_number,
            )
            return {"status": "NEEDS_ATTENTION", "reason": "INVALID_COUNT"}

        if expected_count == 0:
            emit_runtime_event(
                "EMPTY_CONFIRMED",
                "SOURCE_DISCOVERY",
                metadata={
                    "contract_number": contract_number,
                    "expected_package_count": 0,
                    "facility_identity": facility_identity,
                },
                **event_common,
            )
            return {"status": "EMPTY_CONFIRMED"}

        if not link:
            _emit_attention(
                "POSITIVE_COUNT_WITHOUT_LINK",
                facility_identity,
                contract_number=contract_number,
                expected_package_count=expected_count,
            )
            return {
                "status": "NEEDS_ATTENTION",
                "reason": "POSITIVE_COUNT_WITHOUT_LINK",
            }

        existing_handles = set(driver.window_handles)
        requested_at = time.time()
        driver.execute_script("arguments[0].click();", link)
        WebDriverWait(driver, 30).until(
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

        expected_compact_date = service_date.replace("-", "")
        heading = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located(
                (
                    By.XPATH,
                    "//*[self::h1 or self::h2 or self::h3 or self::div]"
                    "[contains(normalize-space(.), "
                    "'All Status Code Packages')]",
                )
            )
        ).text
        heading_match = re.search(
            r"All Status Code Packages\s*--\s*(C\d+)\s*--\s*(\d{8})",
            heading,
            re.IGNORECASE,
        )
        if (
            not heading_match
            or heading_match.group(1).upper() != contract_number
            or heading_match.group(2) != expected_compact_date
        ):
            raise RuntimeError(
                "Package-status heading did not match the selected "
                "contract and service date."
            )

        excel_control = find_package_status_excel_control(driver)
        if not excel_control:
            raise RuntimeError(
                "Package-status page has no unambiguous Excel control."
            )

        before_download = download_snapshot(download_folder)
        driver.execute_script("arguments[0].click();", excel_control)
        downloaded_path, source_ready_at = wait_for_completed_download(
            download_folder,
            before_download,
        )
        source_filename = os.path.basename(downloaded_path)
        extension = os.path.splitext(downloaded_path)[1].lower() or ".xls"
        canonical_name = (
            f"PackageLevelDetails_{contract_number}_"
            f"{expected_compact_date}{extension}"
        )
        canonical_path = os.path.join(download_folder, canonical_name)
        if os.path.exists(canonical_path):
            os.remove(canonical_path)
        os.replace(downloaded_path, canonical_path)

        write_runner_metadata(
            canonical_path,
            {
                "artifact_key": ARTIFACT_KEY,
                "report_family_key": "DSW",
                "report_shape_key": ARTIFACT_KEY,
                "page": "All Status Code Packages",
                "header_authoritative": True,
                "service_date_raw": service_date,
                "service_date_compact": expected_compact_date,
                "contract_number": contract_number,
                "expected_package_count": expected_count,
                "facility_identity": facility_identity,
                "source_download_filename": source_filename,
                "canonical_filename": canonical_name,
                "discovery_status": "COLLECTED",
            },
        )

        emit_runtime_event(
            "SOURCE_REQUESTED",
            "SOURCE",
            occurred_at=datetime.fromtimestamp(
                requested_at, timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            filename=canonical_name,
            metadata={
                "contract_number": contract_number,
                "expected_package_count": expected_count,
                "facility_identity": facility_identity,
            },
            **event_common,
        )
        emit_runtime_event(
            "SOURCE_READY",
            "SOURCE",
            occurred_at=datetime.fromtimestamp(
                source_ready_at, timezone.utc
            ).isoformat().replace("+00:00", "Z"),
            filename=canonical_name,
            **event_common,
        )
        emit_runtime_event(
            "DOWNLOAD_COMPLETED",
            "DOWNLOAD",
            filename=canonical_name,
            metadata={
                "contract_number": contract_number,
                "expected_package_count": expected_count,
            },
            **event_common,
        )
        return {
            "status": "COLLECTED",
            "filename": canonical_name,
            "contract_number": contract_number,
            "expected_package_count": expected_count,
        }
    except Exception as error:
        logging.info(
            "Optional DSW package-status collection failed: %s",
            error,
        )
        _emit_attention(
            str(error),
            facility_identity,
            event_stage="DOWNLOAD",
            error_type=type(error).__name__,
        )
        return {"status": "NEEDS_ATTENTION", "reason": str(error)}
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

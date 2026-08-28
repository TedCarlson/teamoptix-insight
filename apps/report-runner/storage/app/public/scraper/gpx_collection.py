"""Select and preserve the route GPX exposed by one manifest search.

The manifest search owns route/date selection. GPX filenames are transport
labels only and must never be used as route identity evidence.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path


def normalize_route_identity(value: object) -> str:
    text = str(value or "").strip().upper()
    match = re.search(r"(?<!\d)(\d{1,4})(?!\d)", text)
    if match:
        return str(int(match.group(1)))
    return re.sub(r"[^A-Z0-9]+", "", text)


def gpx_candidate_score(candidate: dict, route_identity: object) -> int:
    """Rank visible GPX controls using their semantic label and row context."""
    if not candidate.get("visible") or candidate.get("disabled"):
        return -10000
    direct = str(candidate.get("direct_semantic") or "").lower()
    context = str(candidate.get("context_semantic") or "").lower()
    semantic = f"{direct} {context}"
    if "gpx" not in semantic:
        return -10000
    close_to_excel = bool(
        candidate.get("adjacent_to_excel") or candidate.get("right_of_excel")
    )
    delivery_context = "delivery" in semantic and any(
        token in semantic for token in ("route", "stop", "manifest")
    )
    if not close_to_excel and not delivery_context:
        return -10000
    if "pickup" in semantic and "delivery" not in semantic and not close_to_excel:
        return -10000

    score = 100
    if "gpx" in direct:
        score += 80
    if candidate.get("adjacent_to_excel"):
        score += 160
    if candidate.get("right_of_excel"):
        score += 180
    for token, weight in (
        ("delivery", 35),
        ("route", 30),
        ("stop", 20),
        ("manifest", 10),
        ("download", 8),
        ("export", 6),
    ):
        if token in semantic:
            score += weight
    for token, weight in (("pickup", 15), ("combined", 10), ("excel", 45), ("pdf", 45)):
        if token in semantic:
            score -= weight

    normalized_route = normalize_route_identity(route_identity)
    if normalized_route and re.search(
        rf"(?<!\d)0*{re.escape(normalized_route)}(?!\d)", semantic
    ):
        score += 50
    score += 20
    return score


def choose_gpx_candidate(candidates: list[dict], route_identity: object) -> dict | None:
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            gpx_candidate_score(candidate, route_identity),
            -int(candidate.get("dom_index") or 0),
        ),
        reverse=True,
    )
    if not ranked or gpx_candidate_score(ranked[0], route_identity) < 100:
        return None
    return ranked[0]


def discover_gpx_candidates(driver, excel_button_xpath: str | None = None) -> list[dict]:
    candidates = driver.execute_script(
        """
        const excel = arguments[0]
          ? document.evaluate(
              arguments[0], document, null,
              XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue
          : null;
        const excelContainer = excel?.parentElement || null;
        return Array.from(document.querySelectorAll('a,button,input,img'))
          .map((element, domIndex) => {
            const direct = [
              element.id,
              element.getAttribute('name'),
              element.getAttribute('value'),
              element.getAttribute('title'),
              element.getAttribute('aria-label'),
              element.getAttribute('alt'),
              element.getAttribute('src'),
              element.getAttribute('href'),
              element.textContent
            ].filter(Boolean).join(' ').trim();
            const container = element.closest('tr,li,fieldset,form,[role="row"],div');
            const context = (container?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 320);
            const visible = Boolean(
              element.getClientRects().length &&
              window.getComputedStyle(element).visibility !== 'hidden'
            );
            const excelRect = excel?.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const sameHorizontalBand = Boolean(
              excelRect &&
              Math.abs(
                (excelRect.top + excelRect.height / 2) -
                (elementRect.top + elementRect.height / 2)
              ) <= Math.max(18, excelRect.height, elementRect.height)
            );
            return {
              dom_index: domIndex,
              tag: (element.tagName || '').toLowerCase(),
              direct_semantic: direct.slice(0, 320),
              context_semantic: context,
              adjacent_to_excel: Boolean(
                excel && (
                  element.previousElementSibling === excel ||
                  excel.nextElementSibling === element ||
                  (excelContainer && element.parentElement === excelContainer)
                )
              ),
              right_of_excel: Boolean(
                excelRect &&
                sameHorizontalBand &&
                elementRect.left >= excelRect.right - 4 &&
                elementRect.left - excelRect.right <= 120
              ),
              visible,
              disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true')
            };
          })
          .filter((candidate) =>
            `${candidate.direct_semantic} ${candidate.context_semantic}`.toLowerCase().includes('gpx')
          );
        """
        ,
        excel_button_xpath,
    )
    return candidates if isinstance(candidates, list) else []


def click_best_gpx_control(
    driver,
    route_identity: object,
    excel_button_xpath: str | None = None,
) -> dict | None:
    candidate = choose_gpx_candidate(
        discover_gpx_candidates(driver, excel_button_xpath),
        route_identity,
    )
    if candidate is None:
        return None
    clicked = driver.execute_script(
        """
        const nodes = Array.from(document.querySelectorAll('a,button,input,img'));
        const selected = nodes[arguments[0]];
        if (!selected) return false;
        const clickable = selected.closest('a,button') || selected;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        return true;
        """,
        int(candidate["dom_index"]),
    )
    return candidate if clicked else None


def gpx_download_snapshot(download_folder: str) -> set[str]:
    folder = Path(download_folder)
    if not folder.exists():
        return set()
    return {
        str(path.resolve())
        for path in folder.iterdir()
        if path.is_file() and not path.name.startswith(".") and path.suffix.lower() == ".gpx"
    }


def canonical_route_gpx_path(
    download_folder: str,
    route_identity: object,
    service_date: str,
) -> Path | None:
    route_key = normalize_route_identity(route_identity)
    if not route_key:
        return None
    return Path(download_folder) / (
        f"RouteGPX_{service_date.replace('-', '')}_{route_key}.gpx"
    )


def route_gpx_state_marker(
    state_directory: str,
    route_identity: object,
    service_date: str,
) -> Path | None:
    route_key = normalize_route_identity(route_identity)
    safe_date = re.sub(r"[^0-9]", "", str(service_date or ""))
    if not state_directory or not route_key or len(safe_date) != 8:
        return None
    return Path(state_directory) / f"{safe_date}_{route_key}.json"


def mark_route_gpx_collected(
    state_directory: str,
    route_identity: object,
    service_date: str,
    metadata: dict | None = None,
) -> Path:
    marker = route_gpx_state_marker(
        state_directory,
        route_identity,
        service_date,
    )
    if marker is None:
        raise RuntimeError("Route GPX state marker requires route and service date.")
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.parent.chmod(0o700)
    temporary = Path(f"{marker}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(
            {
                "route_identity": normalize_route_identity(route_identity),
                "service_date": service_date,
                "collected_at": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ",
                    time.gmtime(),
                ),
                **(metadata or {}),
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    os.replace(temporary, marker)
    return marker


def route_gpx_already_collected(
    download_folder: str,
    route_identity: object,
    service_date: str,
) -> bool:
    path = canonical_route_gpx_path(
        download_folder,
        route_identity,
        service_date,
    )
    marker = Path(f"{path}.collected.json") if path else None
    state_marker = route_gpx_state_marker(
        os.environ.get("FCMS_GPX_STATE_DIR", ""),
        route_identity,
        service_date,
    )
    return bool(
        (marker and marker.is_file())
        or (state_marker and state_marker.is_file())
    )


def wait_for_gpx_download(
    download_folder: str,
    before: set[str],
    timeout_seconds: int = 45,
) -> tuple[str, float]:
    folder = Path(download_folder)
    deadline = time.time() + timeout_seconds
    last_sizes: dict[str, int] = {}
    first_seen_at = None
    while time.time() < deadline:
        candidates = [
            path
            for path in folder.iterdir()
            if path.is_file()
            and not path.name.startswith(".")
            and path.suffix.lower() == ".gpx"
            and str(path.resolve()) not in before
        ]
        if candidates and first_seen_at is None:
            first_seen_at = time.time()
        candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
        for candidate in candidates:
            size = candidate.stat().st_size
            key = str(candidate)
            if size > 0 and last_sizes.get(key) == size:
                return key, first_seen_at or time.time()
            last_sizes[key] = size
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for GPX download in {download_folder}")


def finalize_route_gpx(
    downloaded_path: str,
    *,
    route_identity: object,
    service_date: str,
    selection_evidence: dict,
) -> tuple[str, dict]:
    source = Path(downloaded_path)
    if not source.is_file():
        raise RuntimeError(f"Downloaded GPX does not exist: {source}")
    route_key = normalize_route_identity(route_identity)
    if not route_key:
        raise RuntimeError("Manifest search did not provide a route identity for GPX.")
    target = canonical_route_gpx_path(str(source.parent), route_key, service_date)
    if target is None:
        raise RuntimeError("Unable to build the canonical route GPX path.")
    source_filename = source.name
    if source.resolve() != target.resolve():
        os.replace(source, target)
    metadata = {
        "artifact_key": "ROUTE_GPX",
        "report_family_key": "FCC",
        "report_shape_key": "FCC_ROUTE_GPX",
        "declared_artifact_type": "route_gpx",
        "source_manifest_type": "COMBINED_MANIFEST",
        "source_download_filename": source_filename,
        "canonical_filename": target.name,
        "route_identity": route_key,
        "identity_authority": "MANIFEST_SEARCH_CONTEXT",
        "collection_context": {
            "selected_work_area": str(route_identity),
            "selected_service_date": service_date,
            "source_lane": "FCC_ROUTE_GPX",
            "source_manifest_type": "COMBINED_MANIFEST",
            "selection_evidence": {
                "score": gpx_candidate_score(selection_evidence, route_identity),
                "semantic": str(selection_evidence.get("direct_semantic") or "")[:240],
                "context": str(selection_evidence.get("context_semantic") or "")[:240],
            },
        },
        "payload_authority": "INGESTION_PIPELINE",
    }
    sidecar = Path(f"{target}.runner.json")
    temporary = Path(f"{sidecar}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(metadata, sort_keys=True), encoding="utf-8")
    os.replace(temporary, sidecar)
    marker = Path(f"{target}.collected.json")
    marker_temporary = Path(f"{marker}.{os.getpid()}.tmp")
    marker_temporary.write_text(
        json.dumps(
            {
                "route_identity": route_key,
                "service_date": service_date,
                "collected_at": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ",
                    time.gmtime(),
                ),
            },
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    os.replace(marker_temporary, marker)
    return str(target), metadata

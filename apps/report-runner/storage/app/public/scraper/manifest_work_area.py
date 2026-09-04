"""Stable route identity helpers for the FedEx manifest work-area selector."""

import re
from collections.abc import Iterable


_OPERATIONAL_ROUTE_STATE = re.compile(
    r"\s-\s(?:AVAILABLE|EOD|ON\s+ROAD|IN\s+PROGRESS|LOGGED\s+IN)(?:\s-\sHELPER)?(?:\s|$)",
    re.IGNORECASE,
)


def normalize_manifest_work_area(value: object) -> str:
    text = str(value or "").strip().upper()
    match = re.search(r"(?<!\d)(\d{1,4})(?!\d)", text)
    if match:
        return str(int(match.group(1)))
    return re.sub(r"[^A-Z0-9]+", "", text)


def stable_manifest_work_areas(option_labels: Iterable[object]) -> list[str]:
    """Return the unique route identities present when a sweep begins."""

    result: list[str] = []
    seen: set[str] = set()
    for label in option_labels:
        route_key = normalize_manifest_work_area(label)
        if not route_key or route_key == "ALL" or route_key in seen:
            continue
        seen.add(route_key)
        result.append(route_key)
    return result


def delivery_manifest_is_required(
    work_area_label: object,
    *,
    explicitly_requested: bool = False,
) -> bool:
    """Distinguish an assigned route from a selector placeholder.

    FedEx keeps planned, unassigned work areas in the selector even when no
    manifest export exists. An explicit closeout/recovery target remains
    authoritative, while a broad pulse only fails for a route that carries a
    driver identity or an operational state.
    """

    if explicitly_requested:
        return True
    label = str(work_area_label or "").strip()
    return "," in label or bool(_OPERATIONAL_ROUTE_STATE.search(label))


def manifest_work_area_index(
    option_labels: Iterable[object],
    route_identity: object,
) -> int | None:
    """Resolve a route against the selector's current order."""

    target = normalize_manifest_work_area(route_identity)
    for index, label in enumerate(option_labels):
        if normalize_manifest_work_area(label) == target:
            return index
    return None

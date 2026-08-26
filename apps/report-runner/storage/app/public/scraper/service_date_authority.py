"""Resolve collection dates from governed terminal-time authority."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def resolve_service_datetime(
    runtime_service_date: str,
    terminal_timezone: str,
    *,
    now: datetime | None = None,
) -> datetime:
    """Return the selected service day as a naive datetime.

    A scheduled cycle's explicit service date is authoritative. If a legacy
    caller does not provide one, "today" is calculated in the terminal's
    configured timezone, never from the runner host or UTC calendar.
    """

    selected = runtime_service_date.strip()
    if selected:
        try:
            return datetime.strptime(selected, "%Y-%m-%d")
        except ValueError as exc:
            raise RuntimeError(
                f"Invalid FCMS_SERVICE_DATE {selected!r}; expected YYYY-MM-DD."
            ) from exc

    zone_name = terminal_timezone.strip()
    if not zone_name:
        raise RuntimeError(
            "FCMS_TERMINAL_TIMEZONE is required when FCMS_SERVICE_DATE is absent."
        )
    try:
        terminal_zone = ZoneInfo(zone_name)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(
            f"Invalid FCMS_TERMINAL_TIMEZONE {zone_name!r}."
        ) from exc

    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        raise RuntimeError("The service-date authority clock must be timezone-aware.")
    local = instant.astimezone(terminal_zone)
    return datetime(local.year, local.month, local.day)

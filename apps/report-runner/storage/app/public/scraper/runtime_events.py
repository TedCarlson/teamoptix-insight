import json
from datetime import datetime, timezone


PREFIX = "RUNTIME_EVENT "


def emit_runtime_event(
    event_type,
    stage,
    *,
    artifact_key=None,
    lane_key=None,
    route_identity=None,
    filename=None,
    occurred_at=None,
    duration_ms=None,
    metadata=None,
):
    payload = {
        "event_type": str(event_type).upper(),
        "stage": str(stage).upper(),
        "occurred_at": occurred_at
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "artifact_key": artifact_key,
        "lane_key": lane_key,
        "route_identity": route_identity,
        "filename": filename,
        "duration_ms": duration_ms,
        "metadata": metadata or {},
    }
    print(PREFIX + json.dumps(payload, sort_keys=True), flush=True)

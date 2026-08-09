"""Durable, bounded delivery of sanitized runner evidence."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


RpcCallable = Callable[..., Any]
MAX_BATCH_SIZE = 250
MAX_PENDING_EVENTS = 200
MAX_MESSAGE_LENGTH = 2000
MAX_STREAM_LENGTH = 64

SENSITIVE_VALUE_PATTERN = re.compile(
    r"(?i)(['\"]?(?:authorization|apikey|api_key|password|passwd|secret|token|cookie)"
    r"['\"]?\s*[:=]\s*)([^,;}]+)"
)
SENSITIVE_QUERY_PATTERN = re.compile(
    r"(?i)([?&](?:apikey|api_key|password|secret|token|code)=)[^&\s]+"
)
SENSITIVE_KEYS = {
    "authorization",
    "apikey",
    "api_key",
    "password",
    "passwd",
    "secret",
    "token",
    "cookie",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sanitize_text(value: Any) -> str:
    text = str(value or "").strip()
    text = SENSITIVE_VALUE_PATTERN.sub(r"\1[REDACTED]", text)
    text = SENSITIVE_QUERY_PATTERN.sub(r"\1[REDACTED]", text)
    return text[:MAX_MESSAGE_LENGTH]


def sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): (
                "[REDACTED]"
                if str(key).lower() in SENSITIVE_KEYS
                else sanitize_value(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return sanitize_text(value)


class RunnerLogEvidence:
    """Persist events first, then idempotently deliver them in bounded batches."""

    def __init__(
        self,
        *,
        outbox_dir: Path,
        runner_key: str,
        cycle_id: str,
        request_type: str | None,
        service_date: str | None,
        rpc: RpcCallable,
    ) -> None:
        self.outbox_dir = Path(outbox_dir)
        self.outbox_dir.mkdir(parents=True, exist_ok=True)
        self.outbox_dir.chmod(0o700)
        self.runner_key = runner_key.strip()
        self.cycle_id = cycle_id
        self.request_type = request_type
        self.service_date = service_date
        self.rpc = rpc
        self.path = self.outbox_dir / f"{self.cycle_id}.json"
        self.events: list[dict[str, Any]] = []
        self.next_sequence = 0
        self.last_error: str | None = None
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        if payload.get("runner_key") != self.runner_key:
            raise RuntimeError("Runner log outbox identity mismatch.")
        if payload.get("cycle_id") != self.cycle_id:
            raise RuntimeError("Runner log outbox cycle mismatch.")
        self.request_type = payload.get("request_type") or self.request_type
        self.service_date = payload.get("service_date") or self.service_date
        self.events = payload.get("events") or []
        self.next_sequence = int(payload.get("next_sequence") or 0)
        if self.events:
            self.next_sequence = max(
                self.next_sequence,
                max(int(event["sequence"]) for event in self.events) + 1,
            )

    def _payload(self) -> dict[str, Any]:
        return {
            "contract": "operations_runner_log_outbox_v1",
            "runner_key": self.runner_key,
            "cycle_id": self.cycle_id,
            "request_type": self.request_type,
            "service_date": self.service_date,
            "next_sequence": self.next_sequence,
            "events": self.events,
        }

    def _persist(self) -> None:
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(self._payload(), separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.chmod(0o600)
        os.replace(temporary, self.path)
        self.path.chmod(0o600)

    def append(
        self,
        message: Any,
        *,
        level: str = "INFO",
        stream: str = "RUNNER",
        occurred_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        clean_message = sanitize_text(message)
        if not clean_message:
            return
        normalized_level = str(level).strip().upper()
        if normalized_level not in {"INFO", "WARN", "ERROR"}:
            normalized_level = "INFO"
        self.events.append(
            {
                "sequence": self.next_sequence,
                "occurred_at": occurred_at or utc_now(),
                "level": normalized_level,
                "stream": sanitize_text(stream)[:MAX_STREAM_LENGTH] or "RUNNER",
                "message": clean_message,
                "metadata_json": sanitize_value(metadata or {}),
            }
        )
        self.next_sequence += 1
        self.events = self.events[-MAX_PENDING_EVENTS:]
        self._persist()

    def flush(self) -> bool:
        """Deliver a failure audit; keep the outbox intact on any error."""
        if self.events and not any(
            str(event.get("level")).upper() == "ERROR"
            for event in self.events
        ):
            self.last_error = "Runner log storage is reserved for failures."
            self._persist()
            return False
        while self.events:
            batch = self.events[:MAX_BATCH_SIZE]
            try:
                self.rpc(
                    "append_operations_runner_log_batch",
                    {
                        "p_runner_key": self.runner_key,
                        "p_cycle_id": self.cycle_id,
                        "p_request_type": self.request_type,
                        "p_service_date": self.service_date,
                        "p_events": batch,
                    },
                    timeout_seconds=30,
                )
            except Exception as exc:  # Evidence must never stop collection.
                self.last_error = sanitize_text(exc)
                self._persist()
                return False
            self.events = self.events[len(batch) :]
            self.last_error = None
            if self.events:
                self._persist()
            elif self.path.exists():
                self.path.unlink()
        return True

    def discard(self) -> None:
        """Remove the temporary trace after an acknowledged healthy cycle."""
        self.events = []
        self.last_error = None
        if self.path.exists():
            self.path.unlink()

    @classmethod
    def drain(
        cls,
        *,
        outbox_dir: Path,
        rpc: RpcCallable,
        exclude_cycle_id: str | None = None,
    ) -> tuple[int, int]:
        """Retry older outboxes, returning (delivered, deferred)."""
        directory = Path(outbox_dir)
        if not directory.exists():
            return (0, 0)
        delivered = 0
        deferred = 0
        for path in sorted(directory.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                cycle_id = str(payload.get("cycle_id") or "")
                if not cycle_id or cycle_id == exclude_cycle_id:
                    continue
                evidence = cls(
                    outbox_dir=directory,
                    runner_key=str(payload.get("runner_key") or ""),
                    cycle_id=cycle_id,
                    request_type=payload.get("request_type"),
                    service_date=payload.get("service_date"),
                    rpc=rpc,
                )
                evidence.append(
                    "Previous cycle ended without a terminal acknowledgement.",
                    level="ERROR",
                    stream="CONTINUOUS",
                    metadata={"classification": "INTERRUPTED"},
                )
                if evidence.flush():
                    delivered += 1
                else:
                    deferred += 1
            except Exception:
                # Preserve malformed evidence for manual recovery.
                deferred += 1
        return (delivered, deferred)

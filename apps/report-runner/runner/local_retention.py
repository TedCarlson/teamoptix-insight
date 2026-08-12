"""Bounded retention for disposable runner working files."""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Any


def _positive_int(value: str | None, default: int) -> int:
    try:
        parsed = int(value or "")
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _remove_expired_files(root: Path, cutoff: float) -> tuple[int, int]:
    if not root.exists():
        return 0, 0
    deleted_count = 0
    deleted_bytes = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        try:
            stat = path.stat()
            if stat.st_mtime >= cutoff:
                continue
            deleted_bytes += stat.st_size
            path.unlink()
            deleted_count += 1
        except FileNotFoundError:
            continue

    for directory in sorted(
        (path for path in root.rglob("*") if path.is_dir()),
        key=lambda path: len(path.parts),
        reverse=True,
    ):
        try:
            directory.rmdir()
        except OSError:
            pass
    return deleted_count, deleted_bytes


def _remove_stale_profiles(root: Path, cutoff: float) -> tuple[int, int]:
    if not root.exists():
        return 0, 0
    deleted_count = 0
    deleted_bytes = 0
    for path in root.glob("chrome-profile*"):
        if not path.is_dir() or path.is_symlink():
            continue
        try:
            if path.stat().st_mtime >= cutoff:
                continue
            deleted_bytes += sum(
                child.stat().st_size
                for child in path.rglob("*")
                if child.is_file() and not child.is_symlink()
            )
            shutil.rmtree(path)
            deleted_count += 1
        except FileNotFoundError:
            continue
    return deleted_count, deleted_bytes


def enforce_local_retention(
    app_dir: Path,
    *,
    now: float | None = None,
    artifact_retention_days: int | None = None,
    diagnostic_retention_days: int | None = None,
) -> dict[str, Any]:
    """Delete expired local copies while preserving uploaded evidence.

    Collection artifacts remain authoritative in Supabase Storage after upload.
    The VPS copies are working files only and must not grow without a bound.
    Cleanup errors are returned as diagnostics and never hide collection work.
    """
    effective_now = now if now is not None else time.time()
    artifact_days = artifact_retention_days or _positive_int(
        os.environ.get("RUNNER_LOCAL_ARTIFACT_RETENTION_DAYS"), 7
    )
    diagnostic_days = diagnostic_retention_days or _positive_int(
        os.environ.get("RUNNER_LOCAL_DIAGNOSTIC_RETENTION_DAYS"), 7
    )
    artifact_cutoff = effective_now - artifact_days * 24 * 60 * 60
    diagnostic_cutoff = effective_now - diagnostic_days * 24 * 60 * 60
    profile_cutoff = effective_now - 48 * 60 * 60
    deleted_files = 0
    deleted_profiles = 0
    deleted_bytes = 0
    errors: list[str] = []

    for path, cutoff in (
        (app_dir / "storage/app/public/scraper/Excels", artifact_cutoff),
        (app_dir / "runtime/spool", artifact_cutoff),
        (app_dir / "storage/app/public/scraper/Logs", diagnostic_cutoff),
        (app_dir / "runtime/logs", diagnostic_cutoff),
    ):
        try:
            count, size = _remove_expired_files(path, cutoff)
            deleted_files += count
            deleted_bytes += size
        except OSError as error:
            errors.append(f"{path.name}: {type(error).__name__}")

    try:
        count, size = _remove_stale_profiles(
            app_dir / "runtime/continuous-runner",
            profile_cutoff,
        )
        deleted_profiles += count
        deleted_bytes += size
    except OSError as error:
        errors.append(f"chrome-profiles: {type(error).__name__}")

    return {
        "artifact_retention_days": artifact_days,
        "diagnostic_retention_days": diagnostic_days,
        "deleted_file_count": deleted_files,
        "deleted_profile_count": deleted_profiles,
        "deleted_bytes": deleted_bytes,
        "errors": errors,
    }


def release_uploaded_artifacts(
    app_dir: Path,
    artifacts: list[dict[str, Any]],
) -> dict[str, Any]:
    """Remove local files only after upload and terminal receipt acceptance."""
    artifact_root = (
        app_dir / "storage/app/public/scraper/Excels"
    ).resolve()
    deleted_count = 0
    deleted_bytes = 0
    errors: list[str] = []

    for artifact in artifacts:
        raw_path = str(artifact.get("path") or "").strip()
        if not raw_path:
            continue
        path = Path(raw_path)
        try:
            resolved = path.resolve()
            if not resolved.is_relative_to(artifact_root):
                errors.append(f"outside-artifact-root: {path.name}")
                continue
            for candidate in (resolved, Path(f"{resolved}.runner.json")):
                if not candidate.exists() or not candidate.is_file():
                    continue
                deleted_bytes += candidate.stat().st_size
                candidate.unlink()
                deleted_count += 1
            try:
                resolved.parent.rmdir()
            except OSError:
                pass
        except OSError as error:
            errors.append(f"{path.name}: {type(error).__name__}")

    return {
        "deleted_file_count": deleted_count,
        "deleted_bytes": deleted_bytes,
        "errors": errors,
    }


def prepare_cycle_spool(
    app_dir: Path,
    company_slug: str,
    cycle_id: str,
) -> Path:
    """Create one isolated working directory for a single client cycle."""
    safe_company = "".join(
        character
        for character in company_slug.lower()
        if character.isalnum() or character in {"-", "_"}
    ).strip("-_")
    safe_cycle = "".join(
        character
        for character in cycle_id.lower()
        if character.isalnum() or character == "-"
    ).strip("-")
    if not safe_company or not safe_cycle:
        raise ValueError("Cycle spool requires safe company and cycle identifiers.")
    spool = app_dir / "runtime/spool" / safe_company / safe_cycle
    (spool / "Excels").mkdir(parents=True, exist_ok=False)
    (spool / "Logs").mkdir(parents=True, exist_ok=True)
    spool.chmod(0o700)
    return spool


def release_cycle_spool(app_dir: Path, spool: Path) -> dict[str, Any]:
    """Delete a cycle spool after its terminal receipt is authoritative."""
    spool_root = (app_dir / "runtime/spool").resolve()
    try:
        resolved = spool.resolve()
        if not resolved.is_relative_to(spool_root) or resolved == spool_root:
            return {
                "released": False,
                "deleted_bytes": 0,
                "error": "outside-spool-root",
            }
        deleted_bytes = sum(
            child.stat().st_size
            for child in resolved.rglob("*")
            if child.is_file() and not child.is_symlink()
        )
        shutil.rmtree(resolved)
        try:
            resolved.parent.rmdir()
        except OSError:
            pass
        return {
            "released": True,
            "deleted_bytes": deleted_bytes,
            "error": None,
        }
    except FileNotFoundError:
        return {"released": True, "deleted_bytes": 0, "error": None}
    except OSError as error:
        return {
            "released": False,
            "deleted_bytes": 0,
            "error": type(error).__name__,
        }

#!/usr/bin/env python3
"""Regression checks for bounded local runner storage."""

import os
import tempfile
import time
from pathlib import Path
import unittest

from local_retention import (
    enforce_local_retention,
    prepare_cycle_spool,
    release_cycle_spool,
)


class LocalRetentionTests(unittest.TestCase):
    def test_removes_only_expired_working_files_and_profiles(self):
        with tempfile.TemporaryDirectory() as temporary:
            app_dir = Path(temporary)
            excels = app_dir / "storage/app/public/scraper/Excels/08-12-2026"
            logs = app_dir / "runtime/logs"
            stale_profile = app_dir / "runtime/continuous-runner/chrome-profile-old"
            recent_profile = app_dir / "runtime/continuous-runner/chrome-profile-recent"
            for directory in (excels, logs, stale_profile, recent_profile):
                directory.mkdir(parents=True, exist_ok=True)

            now = time.time()
            expired_artifact = excels / "expired.xls"
            current_artifact = excels / "current.xls"
            expired_log = logs / "expired.log"
            current_log = logs / "current.log"
            for path in (expired_artifact, current_artifact, expired_log, current_log):
                path.write_bytes(b"evidence")
            (stale_profile / "cache.bin").write_bytes(b"cache")
            (recent_profile / "cache.bin").write_bytes(b"cache")

            os.utime(expired_artifact, (now - 8 * 86400, now - 8 * 86400))
            os.utime(current_artifact, (now - 1 * 3600, now - 1 * 3600))
            os.utime(expired_log, (now - 8 * 86400, now - 8 * 86400))
            os.utime(current_log, (now - 1 * 86400, now - 1 * 86400))
            os.utime(stale_profile, (now - 49 * 3600, now - 49 * 3600))
            os.utime(recent_profile, (now - 1 * 3600, now - 1 * 3600))

            result = enforce_local_retention(app_dir, now=now)

            self.assertFalse(expired_artifact.exists())
            self.assertTrue(current_artifact.exists())
            self.assertFalse(expired_log.exists())
            self.assertTrue(current_log.exists())
            self.assertFalse(stale_profile.exists())
            self.assertTrue(recent_profile.exists())
            self.assertEqual(result["deleted_file_count"], 2)
            self.assertEqual(result["deleted_profile_count"], 1)
            self.assertEqual(result["errors"], [])

    def test_cycle_spool_is_isolated_by_client_and_released(self):
        with tempfile.TemporaryDirectory() as temporary:
            app_dir = Path(temporary)
            spool = prepare_cycle_spool(
                app_dir,
                "Beacon-Point-Ventures",
                "cycle-123",
            )
            artifact = spool / "Excels" / "current.xls"
            artifact.write_bytes(b"uploaded")

            result = release_cycle_spool(app_dir, spool)

            self.assertFalse(spool.exists())
            self.assertTrue(result["released"])
            self.assertEqual(result["deleted_bytes"], len(b"uploaded"))
            self.assertIsNone(result["error"])

    def test_cycle_spool_release_refuses_paths_outside_spool_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            app_dir = Path(temporary)
            outside = app_dir / "credential-state"
            outside.mkdir()

            result = release_cycle_spool(app_dir, outside)

            self.assertTrue(outside.exists())
            self.assertFalse(result["released"])
            self.assertEqual(result["error"], "outside-spool-root")


if __name__ == "__main__":
    unittest.main()

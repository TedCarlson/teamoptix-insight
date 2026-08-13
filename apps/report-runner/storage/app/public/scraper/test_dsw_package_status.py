import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import dsw_package_status


class FakeDriver:
    window_handles = ["dsw"]

    class SwitchTo:
        def window(self, _handle):
            return None

    switch_to = SwitchTo()


class BrokenDriver:
    @property
    def window_handles(self):
        raise RuntimeError("browser unavailable")

    class SwitchTo:
        def window(self, _handle):
            raise RuntimeError("browser unavailable")

    switch_to = SwitchTo()


class ScriptCaptureDriver:
    def __init__(self):
        self.script = None

    def execute_script(self, script):
        self.script = script
        return {"status": "SOURCE_NOT_OFFERED", "link": None}


class DswPackageStatusTests(unittest.TestCase):
    def test_discovery_maps_shifted_footer_links_without_reading_count(self):
        driver = ScriptCaptureDriver()

        dsw_package_status.discover_dsw_package_status(driver)

        self.assertIn("cell.rowSpan", driver.script)
        self.assertIn("cell.colSpan", driver.script)
        self.assertIn(
            "grid[rowIndex + rowOffset][columnIndex + columnOffset]",
            driver.script,
        )
        self.assertIn("Contract\\s+(C\\d+)\\s+Total", driver.script)
        self.assertIn("Colocation\\s+Total", driver.script)
        self.assertIn("origin.columnIndex", driver.script)
        self.assertIn('targetCell.querySelector("a")', driver.script)
        self.assertNotIn("expected_package_count", driver.script)
        self.assertNotIn("INVALID_COUNT", driver.script)

    def test_fresh_dsw_replaces_prior_same_day_copies(self):
        with tempfile.TemporaryDirectory() as download_folder:
            folder = Path(download_folder)
            canonical = folder / "daily service worksheet.xls"
            duplicate = folder / "daily service worksheet (1).xls"
            downloaded = folder / "daily service worksheet (2).xls"
            canonical.write_bytes(b"old-canonical")
            duplicate.write_bytes(b"old-duplicate")
            downloaded.write_bytes(b"fresh")

            retained = (
                dsw_package_status.retain_latest_daily_service_workbook(
                    downloaded,
                    folder,
                )
            )

            self.assertEqual(
                Path(retained),
                canonical,
            )
            self.assertEqual(canonical.read_bytes(), b"fresh")
            self.assertFalse(duplicate.exists())
            self.assertFalse(downloaded.exists())

    @patch.object(dsw_package_status, "emit_runtime_event")
    def test_local_retention_removes_only_expired_package_files(
        self,
        _emit,
    ):
        with tempfile.TemporaryDirectory() as root:
            old = Path(root) / "07-21-2026"
            recent = Path(root) / "07-22-2026"
            old.mkdir()
            recent.mkdir()
            old_package = old / "PackageLevelDetails_C123_20260721.xls"
            old_sidecar = Path(f"{old_package}.runner.json")
            old_dsw = old / "daily service worksheet.xls"
            recent_package = (
                recent / "PackageLevelDetails_C123_20260722.xls"
            )
            for path in (
                old_package,
                old_sidecar,
                old_dsw,
                recent_package,
            ):
                path.write_bytes(b"synthetic")

            deleted = (
                dsw_package_status.purge_expired_local_package_artifacts(
                    root,
                    today=date(2026, 7, 28),
                )
            )

            self.assertEqual(deleted, 2)
            self.assertFalse(old_package.exists())
            self.assertFalse(old_sidecar.exists())
            self.assertTrue(old_dsw.exists())
            self.assertTrue(recent_package.exists())

    @patch.object(dsw_package_status, "emit_runtime_event")
    @patch.object(dsw_package_status, "discover_dsw_package_status")
    def test_absent_export_control_reports_collection_health(
        self,
        discover,
        emit,
    ):
        discover.return_value = {
            "status": "SOURCE_NOT_OFFERED",
            "link": None,
        }
        with tempfile.TemporaryDirectory() as download_folder:
            result = dsw_package_status.collect_dsw_package_status(
                FakeDriver(),
                dsw_window_handle="dsw",
                download_folder=download_folder,
                facility_identity="TEST",
                service_date="2026-07-28",
            )

        self.assertEqual(result["status"], "SOURCE_UNAVAILABLE")
        self.assertEqual(emit.call_args.args[0], "SOURCE_UNAVAILABLE")

    @patch.object(dsw_package_status, "emit_runtime_event")
    @patch.object(dsw_package_status, "discover_dsw_package_status")
    def test_runner_does_not_interpret_source_count_text(
        self,
        discover,
        emit,
    ):
        discover.return_value = {
            "status": "FOUND",
            "link": None,
        }
        with tempfile.TemporaryDirectory() as download_folder:
            result = dsw_package_status.collect_dsw_package_status(
                FakeDriver(),
                dsw_window_handle="dsw",
                download_folder=download_folder,
                facility_identity="TEST",
                service_date="2026-07-28",
            )

        self.assertEqual(result["status"], "SOURCE_UNAVAILABLE")
        self.assertEqual(
            result["reason"],
            "EXPORT_CONTROL_NOT_AVAILABLE",
        )
        self.assertEqual(emit.call_args.args[0], "SOURCE_UNAVAILABLE")

    @patch.object(dsw_package_status, "emit_runtime_event")
    @patch.object(
        dsw_package_status,
        "discover_dsw_package_status",
        side_effect=RuntimeError("selector changed"),
    )
    def test_browser_failure_never_escapes_optional_lane(
        self,
        _discover,
        _emit,
    ):
        with tempfile.TemporaryDirectory() as download_folder:
            result = dsw_package_status.collect_dsw_package_status(
                BrokenDriver(),
                dsw_window_handle="dsw",
                download_folder=download_folder,
                facility_identity="TEST",
                service_date="2026-07-28",
            )

        self.assertEqual(result["status"], "DOWNLOAD_FAILED")
        self.assertEqual(result["reason"], "selector changed")


if __name__ == "__main__":
    unittest.main()

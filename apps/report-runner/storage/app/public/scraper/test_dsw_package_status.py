import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import dsw_package_status
import pandas as pd


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


class DswPackageStatusTests(unittest.TestCase):
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

    @patch.object(dsw_package_status.pd, "read_excel")
    def test_returned_routes_require_all_dot_fields(self, read_excel):
        read_excel.return_value = pd.DataFrame(
            [
                ["Daily Service Worksheet"],
                [""],
                ["DOT Hours and Miles"],
                [
                    "Svc Area #",
                    "WA Name",
                    "WA#",
                    "Miles",
                    "On Road Hours",
                    "On Duty Hours",
                ],
                ["309747", "BPV 02", "477", "138", "07:13", "08:02"],
                ["309747", "BPV 03", "426", "", "10:06", "10:42"],
                ["Contract Totals", "", "", "", "", ""],
            ]
        )

        returned = dsw_package_status.returned_route_wa_numbers(
            "synthetic.xls"
        )

        self.assertEqual(returned, {"477"})

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
    def test_zero_without_link_is_empty_not_attention(
        self,
        discover,
        emit,
    ):
        discover.return_value = {
            "status": "FOUND",
            "contract_number": "C1234567",
            "expected_package_count": 0,
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

        self.assertEqual(result["status"], "EMPTY_CONFIRMED")
        self.assertEqual(emit.call_args.args[0], "EMPTY_CONFIRMED")

    @patch.object(dsw_package_status, "emit_runtime_event")
    @patch.object(dsw_package_status, "discover_dsw_package_status")
    def test_positive_count_without_link_needs_attention(
        self,
        discover,
        emit,
    ):
        discover.return_value = {
            "status": "FOUND",
            "contract_number": "C1234567",
            "expected_package_count": 3,
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

        self.assertEqual(result["status"], "NEEDS_ATTENTION")
        self.assertEqual(
            result["reason"],
            "POSITIVE_COUNT_WITHOUT_LINK",
        )
        self.assertEqual(emit.call_args.args[0], "NEEDS_ATTENTION")

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

        self.assertEqual(result["status"], "NEEDS_ATTENTION")
        self.assertEqual(result["reason"], "selector changed")


if __name__ == "__main__":
    unittest.main()

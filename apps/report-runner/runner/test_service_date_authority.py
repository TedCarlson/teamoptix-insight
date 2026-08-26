#!/usr/bin/env python3
import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "storage/app/public/scraper/service_date_authority.py"
)
SPEC = importlib.util.spec_from_file_location(
    "service_date_authority_under_test",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ServiceDateAuthorityTests(unittest.TestCase):
    def test_governed_cycle_date_survives_utc_midnight(self):
        result = MODULE.resolve_service_datetime(
            "2026-08-25",
            "America/New_York",
            now=datetime(2026, 8, 26, 0, 15, tzinfo=timezone.utc),
        )

        self.assertEqual(result.strftime("%Y-%m-%d"), "2026-08-25")

    def test_today_fallback_uses_terminal_timezone(self):
        result = MODULE.resolve_service_datetime(
            "",
            "America/New_York",
            now=datetime(2026, 8, 26, 0, 15, tzinfo=timezone.utc),
        )

        self.assertEqual(result.strftime("%Y-%m-%d"), "2026-08-25")

    def test_today_fallback_requires_terminal_timezone(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "FCMS_TERMINAL_TIMEZONE is required",
        ):
            MODULE.resolve_service_datetime(
                "",
                "",
                now=datetime(2026, 8, 26, 0, 15, tzinfo=timezone.utc),
            )


if __name__ == "__main__":
    unittest.main()

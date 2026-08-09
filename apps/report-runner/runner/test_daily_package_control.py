#!/usr/bin/env python3
"""Regression checks for app-authoritative daily-package gates."""

from pathlib import Path
import unittest


class DailyPackageControlContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(__file__).with_name(
            "continuous-controller.py"
        ).read_text(encoding="utf-8")
        cls.service_override = Path(__file__).with_name(
            "teamoptix-continuous-controller-dro.conf"
        ).read_text(encoding="utf-8")

    def test_dro_am_gate_comes_from_signed_schedule(self):
        self.assertIn(
            'dro_am = self.schedule.get("dro_am")',
            self.source,
        )
        self.assertIn('enabled = bool(dro_am.get("enabled"))', self.source)
        self.assertIn("enabled = LEGACY_DRO_AM_ENABLED", self.source)
        self.assertIn("start_time = LEGACY_DRO_AM_TIME", self.source)
        self.assertIn(
            "the signed schedule always wins",
            self.source,
        )
        self.assertNotIn("DRO_AM_ENABLED", self.service_override)
        self.assertNotIn("DRO_AM_TIME", self.service_override)

    def test_operations_pulse_is_success_chained(self):
        self.assertIn(
            "Success chains immediately into the next cycle.",
            self.source,
        )
        self.assertIn('self.stop_event.wait(1)', self.source)

    def test_runner_reports_its_git_revision(self):
        self.assertIn('["git", "rev-parse", "--verify", "HEAD"]', self.source)
        self.assertIn("RUNNER_VERSION = detect_runner_version()", self.source)


if __name__ == "__main__":
    unittest.main()

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
        cls.service_unit = Path(__file__).with_name(
            "teamoptix-continuous-controller.service"
        ).read_text(encoding="utf-8")

    def test_dro_am_gate_comes_from_signed_schedule(self):
        self.assertIn(
            'dro_am = self.schedule.get("dro_am") or {}',
            self.source,
        )
        self.assertIn('if not dro_am.get("enabled"):', self.source)
        self.assertNotIn("DRO_AM_ENABLED", self.source)
        self.assertNotIn("DRO_AM_TIME", self.source)
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
        self.assertNotIn("TEAMOPTIX_RUNNER_VERSION", self.service_unit)

    def test_service_runs_from_unified_insight_checkout(self):
        self.assertIn(
            "WorkingDirectory=/root/teamoptix-insight/apps/report-runner",
            self.service_unit,
        )

    def test_canonical_runner_does_not_warehouse_in_legacy_mysql(self):
        cycle_source = Path(__file__).with_name(
            "run-continuous-cycle.py"
        ).read_text(encoding="utf-8")
        self.assertIn(
            'environment["FCMS_WRITE_LOCAL_DATABASE"] = "0"',
            cycle_source,
        )
        self.assertIn(
            "/root/teamoptix-insight/apps/report-runner/runner/"
            "continuous-controller.py",
            self.service_unit,
        )

    def test_canonical_collection_path_never_validates_workbook_payloads(self):
        app_dir = Path(__file__).resolve().parents[1]
        sources = [
            Path(__file__).with_name("run-insight-request.py"),
            app_dir / "storage/app/public/scraper/dynamic_script.py",
            app_dir / "storage/app/public/scraper/scrape_particular_date.py",
            app_dir / "storage/app/public/scraper/dsw_package_status.py",
        ]
        combined = "\n".join(
            source.read_text(encoding="utf-8") for source in sources
        )

        for forbidden in (
            "read_excel(",
            "renameDownloadedManifest",
            "renameFolder(",
            "extractDataFromFolder",
            "header_authoritative",
            "returned_route_wa_numbers",
        ):
            self.assertNotIn(forbidden, combined)

        self.assertIn('"payload_authority": "INGESTION_PIPELINE"', combined)


if __name__ == "__main__":
    unittest.main()

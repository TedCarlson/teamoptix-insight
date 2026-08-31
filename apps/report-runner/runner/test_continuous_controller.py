#!/usr/bin/env python3
import importlib.util
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo


MODULE_PATH = Path(__file__).with_name("continuous-controller.py")


def load_module():
    with tempfile.TemporaryDirectory() as temporary_directory:
        env_file = Path(temporary_directory) / "insight.env"
        env_file.write_text(
            "SUPABASE_URL=https://example.supabase.co\n"
            "SUPABASE_SERVICE_ROLE_KEY=test-service-role\n"
        )
        with mock.patch.dict(
            os.environ,
            {
                "INSIGHT_ENV_FILE": str(env_file),
                "TEAMOPTIX_RUNNER_VERSION": "test-runner",
            },
        ):
            spec = importlib.util.spec_from_file_location(
                "continuous_controller_under_test",
                MODULE_PATH,
            )
            module = importlib.util.module_from_spec(spec)
            assert spec and spec.loader
            spec.loader.exec_module(module)
            return module


MODULE = load_module()


class ContinuousControllerTests(unittest.TestCase):
    def controller(self):
        controller = MODULE.ContinuousController()
        controller.schedule = {
            "company_id": "00000000-0000-0000-0000-000000000001",
            "operations_pulse": {
                "start_time": "07:30",
                "end_time": "19:30",
            },
            "route_closeout": {
                "enabled": True,
                "start_time": "19:30",
                "end_time": "23:50",
                "final_sweep_start_time": "23:30",
                "fcc_interval_minutes": 10,
                "dsw_interval_minutes": 30,
                "route_batch_size": 6,
                "reports": [
                    "FCC",
                    "DELIVERY_MANIFEST",
                    "PICKUP_MANIFEST",
                    "ROUTE_GPX",
                ],
            },
        }
        controller.journal = {}
        return controller

    def test_normal_child_exit_owns_terminal_handoff(self):
        self.assertTrue(MODULE.cycle_exit_has_terminal_handoff(0))
        self.assertTrue(MODULE.cycle_exit_has_terminal_handoff(1))

    def test_signal_exit_stays_in_journal_for_restart_reconciliation(self):
        self.assertFalse(MODULE.cycle_exit_has_terminal_handoff(-15))
        self.assertFalse(MODULE.cycle_exit_has_terminal_handoff(-9))

    def test_credential_block_preserves_existing_reconciliation_behavior(self):
        self.assertFalse(MODULE.cycle_exit_has_terminal_handoff(40))

    def test_route_closeout_owns_the_clock_when_operations_pulse_ends(self):
        controller = self.controller()
        zone = ZoneInfo("America/New_York")
        before = datetime(2026, 8, 25, 19, 29, tzinfo=zone)
        handoff = datetime(2026, 8, 25, 19, 30, tzinfo=zone)
        cutoff = datetime(2026, 8, 25, 23, 50, tzinfo=zone)

        self.assertTrue(controller.within_pulse_window(before))
        self.assertFalse(controller.within_route_closeout_window(before))
        self.assertFalse(controller.within_pulse_window(handoff))
        self.assertTrue(controller.within_route_closeout_window(handoff))
        self.assertFalse(controller.within_route_closeout_window(cutoff))
        self.assertTrue(controller.route_closeout_cutoff_due(cutoff))

    def test_fixed_daily_jobs_remain_due_after_their_exact_minute(self):
        controller = self.controller()
        controller.schedule["previous_day_close"] = {
            "enabled": True,
            "start_time": "03:00",
        }
        controller.schedule["dro_am"] = {
            "enabled": True,
            "start_time": "04:00",
        }
        zone = ZoneInfo("America/New_York")

        self.assertTrue(
            controller.previous_day_close_due(
                datetime(2026, 8, 31, 3, 47, tzinfo=zone)
            )
        )
        self.assertTrue(
            controller.dro_am_due(
                datetime(2026, 8, 31, 4, 22, tzinfo=zone)
            )
        )

    def test_route_closeout_uses_reduced_source_cadence(self):
        controller = self.controller()
        zone = ZoneInfo("America/New_York")
        now = datetime(2026, 8, 25, 20, 0, tzinfo=zone)

        self.assertTrue(controller.route_closeout_source_due(now))
        reports = controller.route_closeout_reports(now, ["447"])
        self.assertEqual(
            reports,
            [
                "DSW",
                "FCC",
                "DELIVERY_MANIFEST",
                "PICKUP_MANIFEST",
                "ROUTE_GPX",
            ],
        )

        controller.journal = {
            "route_closeout_last_fcc_at": "2026-08-26T00:00:00Z",
            "route_closeout_last_dsw_at": "2026-08-26T00:00:00Z",
        }
        self.assertFalse(controller.route_closeout_source_due(now))

    def test_retained_gpx_recovery_uses_terminal_day_and_bounded_window(self):
        controller = self.controller()
        zone = ZoneInfo("America/New_York")
        before = datetime(2026, 8, 31, 3, 9, tzinfo=zone)
        due = datetime(2026, 8, 31, 3, 10, tzinfo=zone)
        pulse = datetime(2026, 8, 31, 7, 30, tzinfo=zone)

        self.assertFalse(controller.retained_gpx_recovery_due(before))
        self.assertTrue(controller.retained_gpx_recovery_due(due))
        self.assertFalse(controller.retained_gpx_recovery_due(pulse))

        controller.journal["retained_gpx_recovery_date"] = "2026-08-31"
        self.assertFalse(controller.retained_gpx_recovery_due(due))

    def test_route_closeout_never_drops_required_gpx_target(self):
        controller = self.controller()
        controller.schedule["route_closeout"]["reports"] = ["FCC"]
        zone = ZoneInfo("America/New_York")
        reports = controller.route_closeout_reports(
            datetime(2026, 8, 31, 20, 0, tzinfo=zone),
            ["447"],
        )

        self.assertIn("ROUTE_GPX", reports)
        self.assertIn("DELIVERY_MANIFEST", reports)
        self.assertIn("PICKUP_MANIFEST", reports)

    def test_first_pulse_establishes_manifest_baseline_before_gpx(self):
        controller = self.controller()
        controller.schedule["operations_pulse"]["reports"] = [
            "DSW",
            "FCC",
            "DELIVERY_MANIFEST",
            "PICKUP_MANIFEST",
            "ROUTE_GPX",
        ]
        now = datetime(
            2026,
            8,
            31,
            7,
            30,
            tzinfo=ZoneInfo("America/New_York"),
        )

        self.assertNotIn("ROUTE_GPX", controller.operations_pulse_reports(now))
        controller.journal["operations_pulse_manifest_baseline_date"] = (
            "2026-08-31"
        )
        self.assertIn("ROUTE_GPX", controller.operations_pulse_reports(now))

    def test_manifest_baseline_resets_by_terminal_service_date(self):
        controller = self.controller()
        controller.schedule["operations_pulse"]["reports"] = [
            "DELIVERY_MANIFEST",
            "ROUTE_GPX",
        ]
        controller.journal["operations_pulse_manifest_baseline_date"] = (
            "2026-08-30"
        )
        now = datetime(
            2026,
            8,
            31,
            7,
            30,
            tzinfo=ZoneInfo("America/New_York"),
        )

        self.assertEqual(
            controller.operations_pulse_reports(now),
            ["DELIVERY_MANIFEST"],
        )


if __name__ == "__main__":
    unittest.main()

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
                "RUNNER_KEY": "r-test-company-dev",
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
                "interval_minutes": 60,
            },
            "route_closeout": {
                "enabled": True,
                "start_time": "19:30",
                "end_time": "23:50",
                "final_sweep_start_time": "23:30",
                "fcc_interval_minutes": 10,
                "dsw_interval_minutes": 30,
                "route_batch_size": 6,
                "target_poll_interval_minutes": 15,
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

    def test_company_control_identity_requires_both_uuid_values(self):
        with mock.patch.object(MODULE, "RUNNER_ID", ""), mock.patch.object(
            MODULE,
            "RUNNER_ASSIGNMENT_ID",
            "22222222-2222-4222-8222-222222222222",
        ):
            with self.assertRaisesRegex(RuntimeError, "configured together"):
                MODULE.ContinuousController.governed_command_identity()

    def test_pause_command_stops_new_work_and_acknowledges_completion(self):
        controller = self.controller()
        controller.schedule["collection_enabled"] = True
        controller.save_journal = mock.Mock()
        controller.acknowledge_runner_command = mock.Mock()
        command = {
            "id": "33333333-3333-4333-8333-333333333333",
            "command_type": "PAUSE",
        }

        controller.apply_runner_command(command)

        self.assertEqual(controller.control_mode(), "PAUSED")
        self.assertFalse(controller.start_allowed())
        self.assertIsNone(controller.journal["pending_runner_command"])
        self.assertEqual(
            [call.args[1] for call in controller.acknowledge_runner_command.call_args_list],
            ["ACKNOWLEDGED", "SUCCEEDED"],
        )

    def test_drain_waits_for_the_active_cycle_before_succeeding(self):
        controller = self.controller()
        controller.save_journal = mock.Mock()
        controller.acknowledge_runner_command = mock.Mock()
        process = mock.Mock()
        process.poll.return_value = None
        controller.active_process = process
        command = {
            "id": "44444444-4444-4444-8444-444444444444",
            "command_type": "DRAIN_STOP",
        }

        controller.apply_runner_command(command)

        self.assertEqual(controller.control_mode(), "DRAINING")
        self.assertEqual(
            controller.acknowledge_runner_command.call_args.args[1],
            "ACKNOWLEDGED",
        )
        self.assertIsInstance(controller.journal["pending_runner_command"], dict)

        process.poll.return_value = 0
        controller.active_process = None
        controller.complete_pending_runner_command_if_safe()

        self.assertEqual(controller.control_mode(), "PAUSED")
        self.assertIsNone(controller.journal["pending_runner_command"])
        self.assertEqual(
            controller.acknowledge_runner_command.call_args.args[1],
            "SUCCEEDED",
        )

    def test_emergency_stop_signals_the_active_process_group(self):
        controller = self.controller()
        controller.save_journal = mock.Mock()
        controller.acknowledge_runner_command = mock.Mock()
        process = mock.Mock(pid=8123)
        process.poll.return_value = None
        controller.active_process = process
        command = {
            "id": "55555555-5555-4555-8555-555555555555",
            "command_type": "EMERGENCY_STOP",
        }

        with mock.patch.object(MODULE.os, "killpg") as killpg:
            controller.apply_runner_command(command)

        killpg.assert_called_once_with(8123, MODULE.signal.SIGTERM)
        self.assertEqual(controller.control_mode(), "PAUSED")
        self.assertIsInstance(controller.journal["pending_runner_command"], dict)

    def test_resume_reopens_work_only_after_acknowledgement(self):
        controller = self.controller()
        controller.schedule["collection_enabled"] = False
        controller.journal["control_mode"] = "PAUSED"
        controller.save_journal = mock.Mock()
        controller.acknowledge_runner_command = mock.Mock()
        command = {
            "id": "66666666-6666-4666-8666-666666666666",
            "command_type": "RESUME",
        }

        controller.apply_runner_command(command)

        self.assertTrue(controller.start_allowed())
        self.assertEqual(
            [call.args[1] for call in controller.acknowledge_runner_command.call_args_list],
            ["ACKNOWLEDGED", "SUCCEEDED"],
        )

    def test_schedule_identity_must_match_the_enrolled_service(self):
        controller = self.controller()
        controller.save_journal = mock.Mock()
        schedule = {
            "runner_key": MODULE.RUNNER_KEY,
            "runner_id": "11111111-1111-4111-8111-111111111111",
            "assignment_id": "22222222-2222-4222-8222-222222222222",
            "config_version": 1,
            "collection_enabled": False,
            "credential": {"version": 1},
        }

        with mock.patch.object(
            MODULE, "RUNNER_ID", "11111111-1111-4111-8111-111111111111"
        ), mock.patch.object(
            MODULE,
            "RUNNER_ASSIGNMENT_ID",
            "33333333-3333-4333-8333-333333333333",
        ):
            with self.assertRaisesRegex(RuntimeError, "assignment does not match"):
                controller.apply_schedule(schedule, acknowledge=False)

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

    def test_operations_pulse_uses_short_completion_backpressure(self):
        controller = self.controller()
        zone = ZoneInfo("America/New_York")
        now = datetime(2026, 8, 25, 10, 0, tzinfo=zone)

        self.assertTrue(controller.operations_pulse_due(now))
        controller.journal["operations_pulse_last_completed_at"] = (
            "2026-08-25T13:59:30Z"
        )
        self.assertFalse(controller.operations_pulse_due(now))

        after_yield = datetime(2026, 8, 25, 10, 1, tzinfo=zone)
        self.assertTrue(controller.operations_pulse_due(after_yield))

    def test_route_closeout_target_poll_is_bounded_even_without_work(self):
        controller = self.controller()
        zone = ZoneInfo("America/New_York")
        now = datetime(2026, 8, 25, 20, 0, tzinfo=zone)

        self.assertTrue(controller.route_closeout_poll_due(now))
        controller.journal["route_closeout_last_target_poll_at"] = (
            "2026-08-25T23:55:00Z"
        )
        self.assertFalse(controller.route_closeout_poll_due(now))

    def test_recovery_lanes_are_opt_in(self):
        controller = self.controller()
        zone = ZoneInfo("America/New_York")
        due = datetime(2026, 8, 31, 3, 10, tzinfo=zone)

        self.assertEqual(
            controller.run_previous_day_manifest_recovery("2026-08-30"),
            0,
        )
        self.assertFalse(controller.retained_gpx_recovery_due(due))

    def test_retained_gpx_recovery_uses_terminal_day_and_bounded_window(self):
        controller = self.controller()
        controller.schedule["route_closeout"][
            "retained_gpx_recovery_enabled"
        ] = True
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
        reports = controller.operations_pulse_reports(now)
        self.assertIn("ROUTE_GPX", reports)
        self.assertIn("DELIVERY_MANIFEST", reports)
        self.assertIn("PICKUP_MANIFEST", reports)

    def test_gpx_schedule_repairs_missing_manifest_dependencies(self):
        controller = self.controller()
        controller.schedule["operations_pulse"]["reports"] = [
            "DSW",
            "ROUTE_GPX",
        ]
        controller.journal["operations_pulse_manifest_baseline_date"] = (
            "2026-08-31"
        )
        now = datetime(
            2026,
            8,
            31,
            9,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        )

        self.assertEqual(
            controller.operations_pulse_reports(now),
            [
                "DSW",
                "DELIVERY_MANIFEST",
                "PICKUP_MANIFEST",
                "ROUTE_GPX",
            ],
        )

    def test_gpx_is_not_implicitly_enabled_by_a_dsw_only_schedule(self):
        controller = self.controller()
        controller.schedule["operations_pulse"]["reports"] = ["DSW"]
        controller.journal["operations_pulse_manifest_baseline_date"] = (
            "2026-08-31"
        )
        now = datetime(
            2026,
            8,
            31,
            9,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        )

        self.assertEqual(controller.operations_pulse_reports(now), ["DSW"])

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

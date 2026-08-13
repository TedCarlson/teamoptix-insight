#!/usr/bin/env python3
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


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
    def test_normal_child_exit_owns_terminal_handoff(self):
        self.assertTrue(MODULE.cycle_exit_has_terminal_handoff(0))
        self.assertTrue(MODULE.cycle_exit_has_terminal_handoff(1))

    def test_signal_exit_stays_in_journal_for_restart_reconciliation(self):
        self.assertFalse(MODULE.cycle_exit_has_terminal_handoff(-15))
        self.assertFalse(MODULE.cycle_exit_has_terminal_handoff(-9))

    def test_credential_block_preserves_existing_reconciliation_behavior(self):
        self.assertFalse(MODULE.cycle_exit_has_terminal_handoff(40))


if __name__ == "__main__":
    unittest.main()

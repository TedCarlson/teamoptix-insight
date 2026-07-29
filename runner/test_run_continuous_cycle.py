import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).with_name("run-continuous-cycle.py")


def load_module():
    temporary = tempfile.NamedTemporaryFile(mode="w", delete=False)
    temporary.write(
        "SUPABASE_URL=https://example.supabase.co\n"
        "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key\n"
    )
    temporary.close()
    os.environ["INSIGHT_ENV_FILE"] = temporary.name
    spec = importlib.util.spec_from_file_location(
        "teamoptix_run_continuous_cycle",
        MODULE_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


CYCLE = load_module()


class ContinuousCycleContractTests(unittest.TestCase):
    def test_dsw_payload_always_declares_all_codes_companion(self):
        args = SimpleNamespace(
            request_type="PREVIOUS_DAY_CLOSE",
            config_version=8,
        )

        payload = CYCLE.request_payload(args, ["DSW"])

        self.assertEqual(
            [target["key"] for target in payload["targets"]],
            ["DSW_DAILY_SERVICE", "DSW_ALL_STATUS_CODE_PACKAGES"],
        )
        self.assertTrue(payload["targets"][1]["optional_when_empty"])

    def test_browser_handshake_timeout_is_explained_and_sanitized(self):
        output = "\n".join(
            [
                "[runner] log=/root/private/run.log",
                "Authorization: Bearer-should-not-survive",
                "{'username': '8819969', 'password': 'also-secret'}",
                "Traceback (most recent call last):",
                "  File \"scrape_particular_date.py\", line 201, in getDriver",
                "  File \"webdriver.py\", line 300, in start_session",
                "urllib3.exceptions.ReadTimeoutError: "
                "HTTPConnectionPool(host='localhost', port=43661): "
                "Read timed out. (read timeout=120)",
            ]
        )

        evidence = CYCLE.failure_evidence(
            donor_exit_code=1,
            output_tail=output,
            stages=[],
            auth_failure=False,
            upload_error=None,
        )

        self.assertEqual(evidence["stage"], "BROWSER_STARTUP")
        self.assertIn("120-second timeout", evidence["summary"])
        self.assertNotIn(
            "Bearer-should-not-survive",
            "\n".join(evidence["log_excerpt"]),
        )
        self.assertNotIn(
            "also-secret",
            "\n".join(evidence["log_excerpt"]),
        )
        self.assertEqual(evidence["source_logs"], ["run.log"])

    def test_nonblocking_source_failures_are_terminal_exceptions(self):
        evidence = CYCLE.cycle_exception_evidence(
            [
                {
                    "event_type": "SOURCE_UNAVAILABLE",
                    "stage": "SOURCE",
                    "lane_key": "FCC_DELIVERY_MANIFESTS",
                    "artifact_key": "DELIVERY_MANIFEST",
                    "route_identity": "430 BPV 01",
                    "metadata": {
                        "reason": "EXPORT_CONTROL_NOT_AVAILABLE",
                    },
                },
                {
                    "event_type": "SOURCE_UNAVAILABLE",
                    "stage": "SOURCE",
                    "lane_key": "FCC_PICKUP_MANIFESTS",
                    "artifact_key": "PICKUP_MANIFEST",
                    "route_identity": "430 BPV 01",
                    "metadata": {
                        "reason": "EXPORT_CONTROL_NOT_AVAILABLE",
                    },
                },
                {
                    "event_type": "NEEDS_ATTENTION",
                    "stage": "SOURCE_DISCOVERY",
                    "lane_key": "DSW_PACKAGE_STATUS",
                    "artifact_key": "DSW_ALL_STATUS_CODE_PACKAGES",
                    "metadata": {"reason": "INVALID_COUNT"},
                },
                {
                    "event_type": "DOWNLOAD_FAILED",
                    "stage": "DOWNLOAD",
                    "lane_key": "FCC_DELIVERY_MANIFESTS",
                    "artifact_key": "DELIVERY_MANIFEST",
                    "route_identity": "434 BPV 04",
                    "metadata": {"reason": "TimeoutException"},
                },
                {
                    "event_type": "EMPTY_CONFIRMED",
                    "stage": "SOURCE_DISCOVERY",
                    "lane_key": "DSW_PACKAGE_STATUS",
                    "artifact_key": "DSW_ALL_STATUS_CODE_PACKAGES",
                    "metadata": {"expected_package_count": 0},
                },
            ]
        )

        self.assertIsNotNone(evidence)
        self.assertIn(
            "2 requested source exports were unavailable",
            evidence["summary"],
        )
        self.assertIn(
            "1 collection lane requires attention",
            evidence["summary"],
        )
        self.assertIn(
            "1 requested report download failed",
            evidence["summary"],
        )
        self.assertEqual(
            evidence["event_counts"],
            {
                "SOURCE_UNAVAILABLE": 2,
                "NEEDS_ATTENTION": 1,
                "DOWNLOAD_FAILED": 1,
            },
        )
        self.assertEqual(
            evidence["affected_routes"],
            ["430 BPV 01", "434 BPV 04"],
        )

    def test_confirmed_empty_optional_lane_is_not_an_exception(self):
        evidence = CYCLE.cycle_exception_evidence(
            [
                {
                    "event_type": "EMPTY_CONFIRMED",
                    "stage": "SOURCE_DISCOVERY",
                    "lane_key": "DSW_PACKAGE_STATUS",
                    "artifact_key": "DSW_ALL_STATUS_CODE_PACKAGES",
                    "metadata": {"expected_package_count": 0},
                }
            ]
        )

        self.assertIsNone(evidence)


if __name__ == "__main__":
    unittest.main()

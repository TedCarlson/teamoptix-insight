import ast
import unittest
from pathlib import Path


RUNNER = Path(__file__).with_name("run-insight-request.py")
CONTINUOUS_RUNNER = Path(__file__).with_name("run-continuous-cycle.py")
SCRAPER_HOME = RUNNER.parent.parent / "storage" / "app" / "public" / "scraper"


class GpxArtifactContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = RUNNER.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)

    def test_runner_recognizes_gpx_as_supplemental_fcc_geometry(self):
        contracts = []
        for node in ast.walk(self.tree):
            if not isinstance(node, ast.Dict):
                continue
            values = {}
            for key, value in zip(node.keys, node.values):
                if (
                    isinstance(key, ast.Constant)
                    and isinstance(key.value, str)
                    and isinstance(value, ast.Constant)
                ):
                    values[key.value] = value.value
            if values.get("artifact_key") == "ROUTE_GPX":
                contracts.append(values)
        self.assertTrue(contracts)
        self.assertEqual(contracts[0]["report_family_key"], "FCC")
        self.assertEqual(contracts[0]["report_shape_key"], "FCC_ROUTE_GPX")
        self.assertIn('return "FCC_ROUTE_GPX"', self.source)

    def test_gpx_is_collected_only_as_a_manifest_supplement(self):
        self.assertIn('if artifact_key == "ROUTE_GPX":', self.source)
        self.assertIn('"ROUTE_GPX",', self.source)
        self.assertIn('"DELIVERY_MANIFEST"', self.source)
        self.assertIn('file.name.endswith(".gpx.collected.json")', self.source)

    def test_targeted_gpx_only_pass_disables_excel_downloads(self):
        self.assertIn("def route_gpx_only", self.source)
        self.assertIn(
            'target_artifact_keys(request) == {"ROUTE_GPX"}',
            self.source,
        )
        self.assertIn('child_env["FCMS_ROUTE_GPX_ONLY"]', self.source)
        for script_name in ("dynamic_script.py", "scrape_particular_date.py"):
            source = (SCRAPER_HOME / script_name).read_text(encoding="utf-8")
            self.assertIn("def should_collect_route_gpx", source)
            self.assertIn('os.environ.get("FCMS_ROUTE_GPX_ONLY"', source)
            self.assertIn("if should_collect_route_gpx():", source)

    def test_targeted_gpx_only_pass_uses_an_isolated_browser(self):
        self.assertIn("gpx_only = route_gpx_only(request)", self.source)
        self.assertIn(
            'child_env["FCMS_PERSIST_BROWSER"] = "0" if gpx_only else "1"',
            self.source,
        )
        self.assertIn(
            'child_env["FCMS_FRESH_BROWSER"] = "1" if gpx_only else "0"',
            self.source,
        )

    def test_optional_gpx_failures_are_isolated_from_excel_collection(self):
        for script_name in ("dynamic_script.py", "scrape_particular_date.py"):
            source = (SCRAPER_HOME / script_name).read_text(encoding="utf-8")
            tree = ast.parse(source)
            wrapper = next(
                node
                for node in tree.body
                if isinstance(node, ast.FunctionDef)
                and node.name == "collectOptionalRouteGpx"
            )
            self.assertTrue(
                any(isinstance(node, ast.Try) for node in ast.walk(wrapper)),
                f"{script_name} must isolate supplemental GPX failures",
            )

    def test_once_daily_state_is_written_only_after_terminal_receipt(self):
        source = CONTINUOUS_RUNNER.read_text(encoding="utf-8")
        self.assertIn("preserve_acknowledged_route_gpx_state", source)
        terminal_receipt_index = source.index(
            'f"Terminal receipt accepted with outcome {outcome}."'
        )
        preserve_call_index = source.index(
            "preserved_gpx_count = preserve_acknowledged_route_gpx_state"
        )
        self.assertGreater(preserve_call_index, terminal_receipt_index)

    def test_queued_backfill_marks_gpx_only_after_registration(self):
        self.assertIn("preserve_acknowledged_route_gpx_state", self.source)
        registration_index = self.source.index(
            '"REGISTRATION_COMPLETED"'
        )
        preserve_index = self.source.index(
            "preserve_acknowledged_route_gpx_state(request, artifact, registered)"
        )
        self.assertGreater(preserve_index, registration_index)


if __name__ == "__main__":
    unittest.main()

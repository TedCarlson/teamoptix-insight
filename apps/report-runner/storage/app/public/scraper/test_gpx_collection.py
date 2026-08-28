import tempfile
import unittest
from pathlib import Path
from unittest import mock

import gpx_collection


class GpxCollectionTests(unittest.TestCase):
    def test_historical_gpx_scan_reacquires_ajax_refreshed_work_area(self):
        source = (Path(__file__).with_name("scrape_particular_date.py")).read_text(
            encoding="utf-8"
        )
        self.assertIn("def selectManifestWorkArea", source)
        self.assertIn("except StaleElementReferenceException", source)
        self.assertIn("attempts = 3 if gpx_only else 1", source)

    def test_prefers_route_delivery_gpx_for_selected_work_area(self):
        candidates = [
            {
                "dom_index": 2,
                "direct_semantic": "Export GPX",
                "context_semantic": "Pickup Manifest WA 42",
                "visible": True,
                "disabled": False,
            },
            {
                "dom_index": 7,
                "direct_semantic": "Download route GPX",
                "context_semantic": "Delivery Manifest route stops WA 0042",
                "adjacent_to_excel": True,
                "visible": True,
                "disabled": False,
            },
        ]
        selected = gpx_collection.choose_gpx_candidate(candidates, "WA 42")
        self.assertEqual(selected["dom_index"], 7)

    def test_rejects_hidden_or_unrelated_controls(self):
        candidates = [
            {
                "dom_index": 1,
                "direct_semantic": "Excel export",
                "context_semantic": "Delivery Manifest",
                "visible": True,
                "disabled": False,
            },
            {
                "dom_index": 2,
                "direct_semantic": "GPX",
                "context_semantic": "Delivery route",
                "visible": False,
                "disabled": False,
            },
        ]
        self.assertIsNone(gpx_collection.choose_gpx_candidate(candidates, "42"))

    def test_does_not_fall_back_to_an_unrelated_pickup_gpx(self):
        candidates = [
            {
                "dom_index": 3,
                "direct_semantic": "Download GPX",
                "context_semantic": "Pickup Manifest",
                "visible": True,
                "disabled": False,
            }
        ]
        self.assertIsNone(gpx_collection.choose_gpx_candidate(candidates, "42"))

    def test_canonical_name_uses_manifest_search_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "vendor-generated-name.gpx"
            source.write_text("<gpx />", encoding="utf-8")
            target, metadata = gpx_collection.finalize_route_gpx(
                str(source),
                route_identity="WA 0042 · BPV",
                service_date="2026-08-28",
                selection_evidence={
                    "direct_semantic": "Download GPX",
                    "context_semantic": "Delivery route 42",
                    "visible": True,
                    "disabled": False,
                },
            )
            self.assertEqual(Path(target).name, "RouteGPX_20260828_42.gpx")
            self.assertEqual(metadata["route_identity"], "42")
            self.assertEqual(metadata["identity_authority"], "MANIFEST_SEARCH_CONTEXT")
            self.assertEqual(metadata["source_manifest_type"], "COMBINED_MANIFEST")
            self.assertTrue(Path(f"{target}.runner.json").exists())
            self.assertTrue(
                gpx_collection.route_gpx_already_collected(
                    folder,
                    "WA 42",
                    "2026-08-28",
                )
            )

    def test_acknowledged_state_survives_a_disposable_cycle_folder(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state = root / "state" / "customer-a"
            first_cycle = root / "spool" / "cycle-a"
            second_cycle = root / "spool" / "cycle-b"
            first_cycle.mkdir(parents=True)
            second_cycle.mkdir(parents=True)
            gpx_collection.mark_route_gpx_collected(
                str(state),
                "WA 42",
                "2026-08-28",
            )
            with mock.patch.dict(
                "os.environ",
                {"FCMS_GPX_STATE_DIR": str(state)},
            ):
                self.assertTrue(
                    gpx_collection.route_gpx_already_collected(
                        str(second_cycle),
                        "42",
                        "2026-08-28",
                    )
                )


if __name__ == "__main__":
    unittest.main()

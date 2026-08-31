#!/usr/bin/env python3
"""Regression checks for the stateless FedEx browser contract."""

from pathlib import Path
import unittest


class BrowserLifecycleContractTests(unittest.TestCase):
    def test_continuous_cycle_forces_stateless_collection_sections(self):
        source = Path(__file__).with_name(
            "run-continuous-cycle.py"
        ).read_text(encoding="utf-8")

        self.assertIn(
            'environment["FCMS_SINGLE_SESSION"] = "0"',
            source,
        )
        self.assertIn(
            'environment["FCMS_PERSIST_BROWSER"] = "0"',
            source,
        )
        self.assertIn(
            'environment["FCMS_FRESH_BROWSER"] = "1"',
            source,
        )
        self.assertIn(
            'environment["FCMS_FORCE_CREDENTIAL_AUTH"] = "1"',
            source,
        )

    def test_manifest_navigation_initializes_combined_before_delivery(self):
        staged_scraper = Path(__file__).with_name("dynamic_script.py")
        repository_scraper = (
            Path(__file__).parents[1]
            / "storage/app/public/scraper/dynamic_script.py"
        )
        scraper_source = (
            staged_scraper
            if staged_scraper.exists()
            else repository_scraper
        ).read_text(encoding="utf-8")

        combined_position = scraper_source.index(
            '"Initialized the Combined Manifest tab..."'
        )
        delivery_position = scraper_source.index(
            '# Delivery Manifest',
            combined_position,
        )
        self.assertLess(combined_position, delivery_position)

    def test_manifest_sweep_survives_fedex_selector_reordering(self):
        scraper_source = (
            Path(__file__).parents[1]
            / "storage/app/public/scraper/dynamic_script.py"
        ).read_text(encoding="utf-8")

        self.assertIn("stable_manifest_work_areas", scraper_source)
        self.assertIn(
            "clickManifestSearch(driver, selected_work_area)",
            scraper_source,
        )
        self.assertIn(
            '"reason": "MANIFEST_ROUTE_NAVIGATION_FAILED"',
            scraper_source,
        )
        self.assertIn(
            "failed without stopping the sweep",
            scraper_source,
        )


if __name__ == "__main__":
    unittest.main()

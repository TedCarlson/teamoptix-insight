#!/usr/bin/env python3

import unittest

from manifest_work_area import (
    manifest_work_area_index,
    normalize_manifest_work_area,
    stable_manifest_work_areas,
)


class ManifestWorkAreaTests(unittest.TestCase):
    def test_normalizes_route_identity_without_driver_status(self):
        self.assertEqual(
            normalize_manifest_work_area("0477 ROBINSON, MICHAEL - EOD"),
            "477",
        )

    def test_sweep_targets_are_stable_and_unique(self):
        self.assertEqual(
            stable_manifest_work_areas(
                ["ALL", "407 BPV 21", "426 BROWN, RICKY - Available", "0426 EOD"]
            ),
            ["407", "426"],
        )

    def test_route_is_resolved_after_selector_reorders(self):
        before = ["ALL", "407 BPV 21", "426 Available", "428 PEAK"]
        after = ["ALL", "428 PEAK", "407 BPV 21", "426 EOD"]

        route_key = stable_manifest_work_areas(before)[1]

        self.assertEqual(route_key, "426")
        self.assertEqual(manifest_work_area_index(after, route_key), 3)


if __name__ == "__main__":
    unittest.main()

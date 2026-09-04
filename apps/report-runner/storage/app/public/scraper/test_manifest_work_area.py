#!/usr/bin/env python3

import unittest

from manifest_work_area import (
    delivery_manifest_is_required,
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

    def test_unassigned_selector_placeholder_does_not_fail_broad_pulse(self):
        self.assertFalse(
            delivery_manifest_is_required("428 PEAK BPV 27")
        )

    def test_driver_or_operational_state_requires_delivery_manifest(self):
        self.assertTrue(
            delivery_manifest_is_required("447 COOPER, HEATHER - Available")
        )
        self.assertTrue(delivery_manifest_is_required("440 PEAK BPV 29 - EOD"))

    def test_explicit_recovery_target_remains_authoritative(self):
        self.assertTrue(
            delivery_manifest_is_required(
                "428 PEAK BPV 27",
                explicitly_requested=True,
            )
        )


if __name__ == "__main__":
    unittest.main()

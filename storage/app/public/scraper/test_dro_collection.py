import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dro_collection


class DroCollectionTests(unittest.TestCase):
    def test_xpath_literal_handles_apostrophe(self):
        self.assertEqual(
            dro_collection._normalized_xpath_literal("BEACON'S"),
            '"BEACON\'S"',
        )

    def test_download_snapshot_tracks_only_csv(self):
        with tempfile.TemporaryDirectory() as folder:
            csv_path = Path(folder) / "package_detail.csv"
            csv_path.write_text("a,b\n1,2\n", encoding="utf-8")
            (Path(folder) / "report.xls").write_bytes(b"xls")

            self.assertEqual(
                dro_collection._download_snapshot(folder),
                {str(csv_path.resolve())},
            )

    @patch.object(dro_collection, "DRO_SERVICE_AREA", "")
    @patch.object(dro_collection, "DRO_BUSINESS_NAME", "")
    def test_entity_selection_requires_navigation_configuration(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "FCMS_DRO_SERVICE_AREA",
        ):
            dro_collection._select_entity(object())


if __name__ == "__main__":
    unittest.main()

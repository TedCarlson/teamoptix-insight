import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import manifest_identity


class ManifestIdentityTests(unittest.TestCase):
    def identity(self, *, route="447", manifest_type="delivery"):
        return {
            "manifest_type": manifest_type,
            "service_date_compact": "20260825",
            "service_area": "309747",
            "work_area": f"{route} DRIVER, TEST - Available",
            "route_key": route,
        }

    def test_route_day_and_type_define_canonical_filename(self):
        with patch.object(
            manifest_identity,
            "readHeaderIdentity",
            return_value=self.identity(),
        ):
            filename, identity = manifest_identity.canonicalManifestFilename(
                "DeliveryManifest.xls",
                expected_type="delivery",
                selected_route_identity="447 DRIVER, TEST",
                selected_service_date="2026-08-25",
            )

        self.assertEqual(
            filename,
            "20260825_0447 DRIVER, TEST - Available.xls",
        )
        self.assertEqual(identity["route_key"], "447")

    def test_stale_workbook_for_another_route_is_rejected(self):
        with patch.object(
            manifest_identity,
            "readHeaderIdentity",
            return_value=self.identity(route="426"),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "selected=447 header=426",
            ):
                manifest_identity.canonicalManifestFilename(
                    "DeliveryManifest.xls",
                    expected_type="delivery",
                    selected_route_identity="447 DRIVER, TEST",
                    selected_service_date="2026-08-25",
                )

    def test_latest_download_replaces_route_canonical_file(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            canonical = folder / "20260825_0447 DRIVER, TEST - Available.xls"
            canonical.write_bytes(b"older")
            downloaded = folder / "DeliveryManifest (19).xls"
            downloaded.write_bytes(b"latest")

            with patch.object(
                manifest_identity,
                "readHeaderIdentity",
                return_value=self.identity(),
            ):
                renamed, metadata = manifest_identity.renameDownloadedManifest(
                    downloaded,
                    expected_type="delivery",
                    selected_route_identity="447",
                    selected_service_date="2026-08-25",
                )

            self.assertEqual(Path(renamed), canonical)
            self.assertEqual(canonical.read_bytes(), b"latest")
            self.assertFalse(downloaded.exists())
            self.assertEqual(metadata["route_key"], "447")
            self.assertTrue(Path(f"{canonical}.runner.json").exists())

    def test_rejected_workbook_is_preserved_outside_artifact_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "DeliveryManifest.xls"
            source.write_bytes(b"stale route workbook")

            rejected = manifest_identity.quarantineRejectedManifest(
                source,
                RuntimeError("selected=447 header=426"),
            )

            rejected_path = Path(rejected)
            self.assertEqual(
                rejected_path.parent.name,
                "RejectedManifestDownloads",
            )
            self.assertEqual(rejected_path.read_bytes(), b"stale route workbook")
            self.assertFalse(source.exists())
            self.assertTrue(Path(f"{rejected_path}.runner.json").exists())


if __name__ == "__main__":
    unittest.main()

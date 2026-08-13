#!/usr/bin/env python3
import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("direct_ingestion.py")
SPEC = importlib.util.spec_from_file_location("direct_ingestion", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def artifact(size=3):
    return {
        "artifact_id": "7bb90e2a-ff29-43d7-93ab-7869d021cad0",
        "service_date": "2026-08-13",
        "lane_key": "FCC_PICKUP_MANIFESTS",
        "source_download_filename": "PickupManifest (11).xls",
        "transport_filename": "2026-08-13__fcc-pickup-manifests__7bb.xls",
        "filename": "2026-08-13__fcc-pickup-manifests__7bb.xls",
        "artifact_key": "PICKUP_MANIFEST",
        "report_family_key": "FCC",
        "content_type": "application/vnd.ms-excel",
        "size_bytes": size,
        "source_hash": "a" * 64,
    }


REQUEST = {
    "id": "a91c2d5f-06fa-47bc-9c88-f1653db70cb3",
    "company_id": "842f6d90-214a-4a18-bb30-10b3f9423bd1",
    "company_slug": "acme-ground",
    "runner_key": "runner-acme-01",
    "service_date": "2026-08-13",
}


class DirectIngestionTests(unittest.TestCase):
    def test_transport_name_is_readable_unique_and_extension_honest(self):
        self.assertEqual(
            MODULE.transport_filename(
                "acme-ground",
                "2026-08-13",
                "FCC_PICKUP_MANIFESTS",
                "PICKUP_MANIFEST",
                "7bb90e2a-ff29-43d7-93ab-7869d021cad0",
                "PickupManifest (11).xls",
            ),
            "acme-ground__2026-08-13__fcc-pickup-manifests__pickup-manifest__7bb90e2a-ff29-43d7-93ab-7869d021cad0.xls",
        )

    def test_derives_v2_endpoint_from_legacy_origin(self):
        self.assertEqual(
            MODULE.derive_endpoint(
                None,
                "https://teamoptix.io/api/company/acme/operations/artifact-ingest",
            ),
            "https://teamoptix.io/api/runner/v2/artifacts/ingest",
        )

    def test_large_file_uses_storage_fallback_without_http_request(self):
        client = MODULE.DirectIngestionClient(
            "https://example.test/ingest", "token"
        )
        result = client.ingest(
            REQUEST,
            artifact(MODULE.MAX_DIRECT_BYTES + 1),
            b"x" * (MODULE.MAX_DIRECT_BYTES + 1),
        )
        self.assertTrue(result["fallback_required"])
        self.assertEqual(result["reason"], "DIRECT_BODY_LIMIT")

    def test_durable_receipt_ends_runner_ownership(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"ok": True, "durable": True}).encode()

        client = MODULE.DirectIngestionClient(
            "https://example.test/ingest", "token"
        )
        with mock.patch.object(
            MODULE.urllib.request,
            "urlopen",
            return_value=Response(),
        ):
            result = client.ingest(REQUEST, artifact(), b"xls")
        self.assertTrue(result["durable"])
        self.assertFalse(result["fallback_required"])


if __name__ == "__main__":
    unittest.main()

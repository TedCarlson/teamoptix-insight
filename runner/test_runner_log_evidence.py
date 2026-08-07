import json
import tempfile
import unittest
from pathlib import Path

from runner_log_evidence import RunnerLogEvidence


class RecordingRpc:
    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls = []

    def __call__(self, name, payload, timeout_seconds):
        self.calls.append((name, payload, timeout_seconds))
        if self.fail:
            raise RuntimeError("token=should-not-leak")
        return {"inserted_count": len(payload["p_events"])}


class RunnerLogEvidenceTests(unittest.TestCase):
    def test_persists_sanitizes_and_delivers_events(self):
        with tempfile.TemporaryDirectory() as directory:
            rpc = RecordingRpc()
            evidence = RunnerLogEvidence(
                outbox_dir=Path(directory),
                runner_key="runner-001",
                cycle_id="5559ea38-89bc-473c-9fa7-206bc80f6fb9",
                request_type="DRO_AM",
                service_date="2026-08-07",
                rpc=rpc,
            )

            evidence.append(
                "download ready token=private-value",
                level="ERROR",
                metadata={"password": "hidden", "rows": 22},
            )

            stored = json.loads(evidence.path.read_text(encoding="utf-8"))
            self.assertNotIn("private-value", json.dumps(stored))
            self.assertNotIn("hidden", json.dumps(stored))
            self.assertTrue(evidence.flush())
            self.assertFalse(evidence.path.exists())
            self.assertEqual(rpc.calls[0][0], "append_operations_runner_log_batch")
            self.assertEqual(rpc.calls[0][1]["p_events"][0]["metadata_json"]["rows"], 22)

    def test_failed_delivery_remains_for_a_later_drain(self):
        with tempfile.TemporaryDirectory() as directory:
            failed_rpc = RecordingRpc(fail=True)
            evidence = RunnerLogEvidence(
                outbox_dir=Path(directory),
                runner_key="runner-001",
                cycle_id="bbb8a6d6-b8fa-4d25-86f2-a8c756d9db6c",
                request_type="DRO_AM",
                service_date="2026-08-07",
                rpc=failed_rpc,
            )
            evidence.append("collector failed", level="ERROR")

            self.assertFalse(evidence.flush())
            self.assertTrue(evidence.path.exists())
            self.assertNotIn("should-not-leak", evidence.last_error or "")

            recovered_rpc = RecordingRpc()
            delivered, deferred = RunnerLogEvidence.drain(
                outbox_dir=Path(directory),
                rpc=recovered_rpc,
            )

            self.assertEqual((delivered, deferred), (1, 0))
            self.assertFalse(evidence.path.exists())
            self.assertEqual(len(recovered_rpc.calls), 1)

    def test_duplicate_delivery_is_safe_for_server_idempotency(self):
        with tempfile.TemporaryDirectory() as directory:
            rpc = RecordingRpc()
            evidence = RunnerLogEvidence(
                outbox_dir=Path(directory),
                runner_key="runner-001",
                cycle_id="eeb8b41c-f169-43f4-a3e3-a6790b93011e",
                request_type="OPERATIONS_PULSE",
                service_date="2026-08-07",
                rpc=rpc,
            )
            evidence.append("first failure", level="ERROR")
            event = json.loads(evidence.path.read_text(encoding="utf-8"))["events"][0]
            self.assertEqual(event["sequence"], 0)
            self.assertTrue(evidence.flush())

            # The database's unique runner/cycle/sequence key makes replaying
            # the same batch a harmless no-op if a crash occurs after delivery.
            rpc("append_operations_runner_log_batch", {
                "p_runner_key": "runner-001",
                "p_cycle_id": "eeb8b41c-f169-43f4-a3e3-a6790b93011e",
                "p_request_type": "OPERATIONS_PULSE",
                "p_service_date": "2026-08-07",
                "p_events": [event],
            }, timeout_seconds=30)
            self.assertEqual(rpc.calls[0][1]["p_events"][0]["sequence"], 0)
            self.assertEqual(rpc.calls[1][1]["p_events"][0]["sequence"], 0)

    def test_healthy_trace_is_discarded_without_delivery(self):
        with tempfile.TemporaryDirectory() as directory:
            rpc = RecordingRpc()
            evidence = RunnerLogEvidence(
                outbox_dir=Path(directory),
                runner_key="runner-001",
                cycle_id="8dc50bd0-18ac-4847-bdf8-a92f92b5480a",
                request_type="DRO_AM",
                service_date="2026-08-07",
                rpc=rpc,
            )
            evidence.append("healthy cycle completed")
            evidence.discard()

            self.assertFalse(evidence.path.exists())
            self.assertEqual(rpc.calls, [])


if __name__ == "__main__":
    unittest.main()

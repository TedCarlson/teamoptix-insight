import ast
import unittest
from pathlib import Path


RUNNER_DIR = Path(__file__).resolve().parent


def parse_file(filename: str) -> ast.Module:
    return ast.parse((RUNNER_DIR / filename).read_text(encoding="utf-8"))


def literal_dict(node: ast.Dict) -> dict[str, str | None]:
    values = {}
    for key, value in zip(node.keys, node.values):
        if (
            isinstance(key, ast.Constant)
            and isinstance(key.value, str)
            and isinstance(value, ast.Constant)
            and (isinstance(value.value, str) or value.value is None)
        ):
            values[key.value] = value.value
    return values


def dict_with_artifact_key(
    tree: ast.AST, artifact_key: str
) -> dict[str, str | None]:
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        values = literal_dict(node)
        if values.get("artifact_key") == artifact_key:
            return values
    raise AssertionError(f"Artifact contract not found: {artifact_key}")


class DroArtifactContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.continuous_tree = parse_file("run-continuous-cycle.py")
        cls.legacy_tree = parse_file("run-insight-request.py")

    def test_continuous_dro_target_defers_shape_to_ingestion(self):
        target = dict_with_artifact_key(
            self.continuous_tree, "DRO_PACKAGE_DETAIL"
        )

        self.assertEqual(target["artifact_key"], "DRO_PACKAGE_DETAIL")
        self.assertIsNone(target["report_shape_key"])
        self.assertIsNone(target["report_frame"])

    def test_legacy_csv_inference_defers_shape_to_ingestion(self):
        identity = dict_with_artifact_key(
            self.legacy_tree, "DRO_PACKAGE_DETAIL"
        )

        self.assertEqual(identity["artifact_key"], "DRO_PACKAGE_DETAIL")
        self.assertIsNone(identity["report_shape_key"])
        self.assertIsNone(identity["report_frame"])


if __name__ == "__main__":
    unittest.main()

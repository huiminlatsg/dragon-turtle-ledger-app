import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("staging_migrations", ROOT / "scripts/prepare_staging_migrations.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StagingMigrationTests(unittest.TestCase):
    def test_other_pr_version_gets_only_an_ephemeral_comment(self):
        with tempfile.TemporaryDirectory() as d:
            original = Path(d, "20261007103748_expense_templates.sql")
            original.write_text("select 1;")
            self.assertEqual(module.prepare(d, ["20261007103748", "20261007104142"]), ["20261007104142"])
            self.assertEqual(original.read_text(), "select 1;")
            stub = Path(d, "20261007104142_staging_other_pr.sql")
            self.assertTrue(all(line.startswith("--") for line in stub.read_text().splitlines()))
            self.assertEqual(module.prepare(d, ["20261007104142"]), [])

    def test_invalid_versions_fail_before_any_write(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                module.prepare(d, ["20261007104142", "../../malicious"])
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_wrong_target_is_refused_before_network_access(self):
        from unittest.mock import patch
        for values in [
            {"TARGET": "production", "STAGING_PROJECT_REF": "stagingref", "EXPECTED_STAGING_REF": "stagingref"},
            {"TARGET": "staging", "STAGING_PROJECT_REF": "other", "EXPECTED_STAGING_REF": "stagingref"},
            {"TARGET": "staging", "STAGING_PROJECT_REF": "stagingref"},
        ]:
            with patch.dict(module.os.environ, values, clear=True), patch.object(module.urllib.request, "urlopen") as network:
                with self.assertRaises(ValueError):
                    module.main()
                network.assert_not_called()

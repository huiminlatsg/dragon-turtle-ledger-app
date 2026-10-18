"""Tests for scripts/privacy-guard.py. All samples are invented.

Samples that the guard must reject are assembled at run time, so this file itself passes the guard.
"""
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("privacy_guard", ROOT / "scripts/privacy-guard.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

REF = "abcdefghijklmnopqrst"  # invented 20-letter project ID


def run(files):
    """files: {path: text or None}."""
    return guard.check(list(files), files.get)


class PathRules(unittest.TestCase):
    def test_planning_documents_are_refused(self):
        for path in [
            "design/rtm.md", "design/notes.txt", "Design/anything.md", "pm/backlog-tracker.md", "pm/SYNC.md",
            "pm/project-instructions.md", "pm/chatgpt-project-instructions.md", "docs/import-agent.md",
            "docs/statement-import.md", "notes/rtm-v2.md", "docs/category-design.md", "backlog-tracker.md",
        ]:
            with self.subTest(path=path):
                self.assertEqual(len(run({path: "x"})), 1)

    def test_generic_docs_are_allowed(self):
        files = {p: "ok" for p in [
            "pm/README.md", "README.md", "CLAUDE.md", "CONTRIBUTING.md", "CHANGELOG.md", "docs/SETUP.md",
            "docs/DATA-MODEL.md", "docs/RUNBOOK.md", "lib/import.ts", "app/import/page.tsx",
        ]}
        self.assertEqual(run(files), [])

    def test_data_and_bank_export_files_are_refused(self):
        for path in ["a.csv", "x/statement.PDF", "b.xlsx", "c.ofx", "d.qif", "e.tsv", "history-2024.json"]:
            with self.subTest(path=path):
                self.assertEqual(len(run({path: None})), 1)
        self.assertEqual(run({"public/icon-192.png": None, "app/icon.png": None}), [])


class ContentRules(unittest.TestCase):
    def test_import_payload_only_in_fixtures(self):
        payload = '{"format": "dtl-' + 'import/1", "lines": []}'
        self.assertEqual(len(run({"lib/sample.json": payload})), 1)
        self.assertEqual(run({"tests/fixtures/invented-statement.json": payload}), [])
        self.assertEqual(run({"lib/import.ts": "const FORMAT = 'dtl-" + "import/1';"}), [])

    def test_supabase_project_forms(self):
        bad = [
            f"https://{REF}.supabase.co",
            f"https://supabase.com/dashboard/project/{REF}/settings",
            f"user=postgres.{REF} host=pooler",
            f'project_id = "{REF}"',
            f"PROJECT_REF: {REF}",
        ]
        for line in bad:
            with self.subTest(line=line):
                self.assertEqual(len(run({"x.md": line})), 1)
        good = 'project_id = "expensify"\nNEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co'
        self.assertEqual(run({"x.toml": good}), [])

    def test_card_numbers_need_a_valid_check_digit(self):
        valid = " ".join(["4111"] + ["1111"] * 3)  # a published test card number
        self.assertEqual(len(run({"t.ts": f"const card = '{valid}';"})), 1)
        self.assertEqual(len(run({"t.ts": "n = " + "5" * 12 + "4444"})), 1)  # another published test number
        harmless = [
            "4111 1111 1111 1112",  # fails the check digit
            "supabase/migrations/20261007104142_recurring_expenses.sql",
            "last4: 1234; amount 12.34; version 0.22.1; id 9e8d7322d03a23645383c011c2a3c615e02c29d9",
        ]
        self.assertEqual(run({"t.md": "\n".join(harmless)}), [])

    def test_two_series_mastercard_is_refused(self):
        number = "2221" + "0000" + "0000" + "0009"  # published test number
        self.assertTrue(guard.luhn_ok(number))
        for text in [number, " ".join(number[i:i + 4] for i in range(0, 16, 4))]:
            with self.subTest(text=text):
                self.assertEqual(len(run({"example.ts": text})), 1)

    def test_personal_email(self):
        self.assertEqual(len(run({"a.md": "mail someone" + "@" + "gmail.com"})), 1)
        self.assertEqual(run({"a.sql": "alice@test.local, 1234+bot@users.noreply.github.com"}), [])

    def test_private_words_by_hash(self):
        exact = hashlib.sha256(b"QZX").hexdigest()
        lower = hashlib.sha256(b"zorblax").hexdigest()
        with patch.object(guard, "PRIVATE_WORD_HASHES", {exact, lower}):
            self.assertEqual(len(run({"a.ts": "tag = 'QZX'"})), 1)
            self.assertEqual(run({"a.ts": "tag = 'qzx'"}), [])  # exact entries keep their case
            for text in ["Zorblax", "ZORBLAX", "pay-zorblax-fees"]:
                with self.subTest(text=text):
                    self.assertEqual(len(run({"a.ts": text})), 1)

    def test_skipped_files(self):
        self.assertEqual(run({"package-lock.json": "x@" + "gmail.com"}), [])


class Repository(unittest.TestCase):
    def test_this_repository_passes(self):
        out = subprocess.run(["python3", "scripts/privacy-guard.py"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout)


if __name__ == "__main__":
    unittest.main()

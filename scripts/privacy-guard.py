#!/usr/bin/env python3
"""Fails if family data, private details or planning documents reach this public repo.

The backlog, requirements, decisions, full designs and all family data live in a separate private repo, which is
their only authoritative copy. This check runs on every pull request (from CI and from the docs secret scan) and
refuses:
  - data and bank-export files (.csv, .xlsx, .ofx, .qif, .pdf and similar) and history files;
  - planning documents: anything in design/, anything in pm/ other than the pm/README.md pointer, and trackers,
    requirements, category or import designs, sync policies and project or agent instructions anywhere;
  - import payloads (JSON declaring the dtl-import format) outside tests/fixtures/, where only invented data goes;
  - personal email addresses (gmail, outlook and similar);
  - Supabase project addresses and IDs (<project id>.supabase.co, dashboard links, pooler user names, project_id or
    project ref assignments); project IDs live in GitHub and Vercel settings;
  - payment card numbers (13-19 digits that pass the Luhn check);
  - a short list of private words. They are stored as SHA-256 hashes to avoid plaintext literals; predictable values may still be guessed. A word
    stored in lowercase matches in any case; other entries match exactly.

It checks file names and the text of every tracked file, including comments, examples and migrations.
Run locally: python3 scripts/privacy-guard.py   (tests: python3 -m unittest discover -s tests/python)
"""
import hashlib
import re
import subprocess
import sys

DATA_FILES = re.compile(
    r"\.(csv|tsv|xlsx|xlsm|xls|ods|numbers|ofx|qfx|qif|mt940|sta|pdf)$"
    r"|(^|/)history[^/]*$|(^|/)expense-category-design\.md$",
    re.IGNORECASE,
)
PLANNING_DOCS = re.compile(
    r"^design/"
    r"|^pm/(?!README\.md$)"
    r"|(^|/)(backlog-tracker|rtm[^/]*|[^/]*category-design[^/]*|statement-import|[^/]*project-instructions"
    r"|import-agent|SYNC)\.md$",
    re.IGNORECASE,
)
PAYLOAD_FILES = re.compile(r"\.(json|jsonl|ndjson|txt)$", re.IGNORECASE)
PAYLOAD_MARKER = re.compile(r"dtl-import/")
FIXTURES = "tests/fixtures/"
PERSONAL_EMAIL = re.compile(
    r"[\w.+-]+@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|qq|163|126)\.(com|com\.sg|sg)\b",
    re.IGNORECASE,
)
SUPABASE_PROJECT = re.compile(
    r"\b[a-z]{20}\.supabase\.(co|com)\b"
    r"|supabase\.com/dashboard/project/[a-z]{20}\b"
    r"|\bpostgres\.[a-z]{20}\b"
    r"|\b(project_id|project[_-]?ref)\b\s*[:=]\s*[\"']?[a-z]{20}\b",
    re.IGNORECASE,
)
CARD_NUMBER = re.compile(r"(?<![\w.-])[2-6]\d{3}(?:[ -]?\d{4}){2}[ -]?\d{1,7}(?![\w.-])")
PRIVATE_WORD_HASHES = {
    "604f9389d5e3233dcc9e7642b26ac6700f7d2fba057f5000b3ca0a2affdd6acd",
    "e65c8b77b23f1f688fec490c49eb8769e02a0b39e2451dd77e0d8a9d0c37e5a2",
    "47cee1712a4efbf3982243b49c487d79ae481580c0ca861b3de3995a36c46fd9",
    "472a93eb63a8a85132ba3ee51453b13da5bf4c69ed21814c08b1a605d143fcab",
    "73f8c2041ac5c3ec022ca3ffc43e404b61e7fe0ce787ae8e137a3c80c955b8d8",
    "842c928cc5a94237f04e306b297de846ca68393f5a17e5d3aa3d604b8f768b5c",
    "754e473f09f501815365b35277b0b027f6d54117a83813055c1b384fb2d0d720",
    "8d49d08da4b0c64f6417681f19bda07bd206e28fb52ebf340fe7076199faf567",
    "00e2b3908d5f3b7eabd85ab51dc9190d0a36b8731569768be6725d998cec93c7",
    "5c225e5b1e9abd58134e3c1864aa5b8d84d3cbab816e3aea2b7f0ce01d912086",
    "dc16dadb0302b46f2d36bdd750168365da11388008df7f9866676d1ecf84c19b",
    "dea7cd279319a43df759b7b07433e75b053f8bdc2f759e328a8331d07cacd40a",
}
WORDS = re.compile(r"[\w-]+")
SKIP = {"package-lock.json", "scripts/privacy-guard.py"}


def luhn_ok(digits):
    total = 0
    for i, d in enumerate(reversed(digits)):
        n = int(d)
        if i % 2:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def card_numbers(line):
    for m in CARD_NUMBER.finditer(line):
        digits = re.sub(r"\D", "", m.group())
        if 13 <= len(digits) <= 19 and luhn_ok(digits):
            yield m.group()


def private_word(line):
    tokens = set(WORDS.findall(line))
    tokens |= {t for w in tokens for t in w.split("-") if t}
    tokens |= {t.lower() for t in tokens}  # lowercase entries match any case; existing entries keep their case
    return any(hashlib.sha256(t.encode()).hexdigest() in PRIVATE_WORD_HASHES for t in tokens)


def check(paths, read):
    """Returns the problems found. `read(path)` returns the file's text, or None if it isn't text."""
    problems = []
    for path in paths:
        if DATA_FILES.search(path):
            problems.append(f"{path}: data file or private document; it belongs in the private repo")
            continue
        if PLANNING_DOCS.search(path):
            problems.append(f"{path}: planning document; the only copy belongs in the private repo")
            continue
        if path in SKIP:
            continue
        text = read(path)
        if text is None:
            continue
        if PAYLOAD_FILES.search(path) and PAYLOAD_MARKER.search(text) and not path.startswith(FIXTURES):
            problems.append(f"{path}: import payload; real payloads stay private, invented ones go in {FIXTURES}")
        for n, line in enumerate(text.splitlines(), 1):
            if PERSONAL_EMAIL.search(line):
                problems.append(f"{path}:{n}: personal email address")
            if SUPABASE_PROJECT.search(line):
                problems.append(f"{path}:{n}: Supabase project address or ID; use a placeholder or a setting")
            if any(card_numbers(line)):
                problems.append(f"{path}:{n}: payment card number")
            if private_word(line):
                problems.append(f"{path}:{n}: private family detail")
    return problems


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True).stdout
    return [p for p in out.decode().split("\0") if p]


def read_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        return None


def main():
    problems = check(tracked_files(), read_text)
    if problems:
        print("Privacy guard failed: this repo is public. Move these to the private repo or remove them:")
        print("\n".join(f"  {p}" for p in problems))
        sys.exit(1)
    print("Privacy guard passed.")


if __name__ == "__main__":
    main()

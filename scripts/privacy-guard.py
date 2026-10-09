#!/usr/bin/env python3
"""Fails if family data or private details reach this public repo.

Family data and spending history live in a separate private archive repo. This check
runs on every pull request (from CI and from the docs secret scan) and refuses:
  - data files and private documents: any .csv, history files, the full category design
    (the public docs in pm/ and design/ are cleaned versions);
  - personal email addresses (gmail, outlook and similar);
  - Supabase project addresses (<project id>.supabase.co); project IDs live in GitHub and Vercel settings;
  - a short list of private words. They are stored only as SHA-256 hashes, so this file reveals nothing.

Run locally: python3 scripts/privacy-guard.py
"""
import hashlib
import re
import subprocess
import sys

BLOCKED_PATHS = re.compile(r"\.csv$|(^|/)history[^/]*$|(^|/)expense-category-design\.md$", re.IGNORECASE)
PERSONAL_EMAIL = re.compile(
    r"[\w.+-]+@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|qq|163|126)\.(com|com\.sg|sg)\b",
    re.IGNORECASE,
)
SUPABASE_PROJECT = re.compile(r"\b[a-z]{20}\.supabase\.co\b")
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
}
WORDS = re.compile(r"[\w-]+")
SKIP = {"package-lock.json", "scripts/privacy-guard.py"}


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True).stdout
    return [p for p in out.decode().split("\0") if p]


def main():
    problems = []
    for path in tracked_files():
        if BLOCKED_PATHS.search(path):
            problems.append(f"{path}: data file or private document; it belongs in the private archive")
            continue
        if path in SKIP:
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if PERSONAL_EMAIL.search(line):
                problems.append(f"{path}:{n}: personal email address")
            if SUPABASE_PROJECT.search(line):
                problems.append(f"{path}:{n}: Supabase project address; use a placeholder or a setting")
            tokens = set(WORDS.findall(line))
            tokens |= {t for w in tokens for t in w.split("-") if t}
            if any(hashlib.sha256(t.encode()).hexdigest() in PRIVATE_WORD_HASHES for t in tokens):
                problems.append(f"{path}:{n}: private family detail")
    if problems:
        print("Privacy guard failed: this repo is public. Move these to the private repo or remove them:")
        print("\n".join(f"  {p}" for p in problems))
        sys.exit(1)
    print("Privacy guard passed.")


if __name__ == "__main__":
    main()

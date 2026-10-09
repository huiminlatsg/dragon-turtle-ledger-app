#!/usr/bin/env python3
"""Ephemeral CI placeholders for migrations already applied by other staging PRs.
Reads only migration version metadata. Never repairs history or executes SQL.
The CLI still applies every unapplied migration in the checked-out branch normally.
"""
import json
import os
from pathlib import Path
import re
import urllib.request



def prepare(directory, versions):
    directory = Path(directory)
    known = {p.name.split("_", 1)[0] for p in directory.glob("*.sql")}
    # Validate the complete response before writing anything.
    if any(not isinstance(v, str) or not re.fullmatch(r"\d{14}", v) for v in versions):
        raise ValueError("invalid migration version metadata")
    missing = sorted(set(versions) - known)
    for version in missing:
        path = directory / (version + "_staging_other_pr.sql")
        with path.open("x") as f:
            f.write("-- CI-only placeholder: this version is already applied in shared staging.\n-- Never commit this file or use it for production.\n")
    return missing


def main():
    ref = os.environ.get("STAGING_PROJECT_REF", "")
    expected = os.environ.get("EXPECTED_STAGING_REF", "")  # from the SUPABASE_STAGING_PROJECT_REF secret
    if os.environ.get("TARGET") != "staging" or not expected or ref != expected:
        raise ValueError("this read-only helper is restricted to the staging project")
    token = os.environ["SUPABASE_ACCESS_TOKEN"]
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": "select version from supabase_migrations.schema_migrations order by version", "read_only": True}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        rows = json.load(response)
    missing = prepare("supabase/migrations", [r["version"] for r in rows])
    print(f"Prepared {len(missing)} CI-only placeholders for other PRs already applied to staging.")


if __name__ == "__main__":
    main()

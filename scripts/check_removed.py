#!/usr/bin/env python3
"""Reads removed.json and refuses a row Wallive would misread.

    check_removed.py [removed.json]

Each row is {id, versions, reason, time}: `versions` null takes down every version, a list the versions it names;
`reason` is malware, broken, author or policy (StoreTakedownReason in the app); `time` is ISO 8601 in UTC with a Z.
Wallive skips a row of removed that does not decode, so a misspelt reason would leave the extension running on every
Mac; the check and the build stop on it here.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

REASONS = ("malware", "broken", "author", "policy")
KEYS = {"id", "versions", "reason", "time"}


class RemovedError(Exception):
    """A row of removed.json that Wallive cannot read; the message names the row and the fix."""


def read_removed(path: Path) -> list:
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RemovedError(f"{path.name} is not JSON: {error}") from error
    if not isinstance(rows, list):
        raise RemovedError(f"{path.name} is a list of rows, such as []")
    for number, row in enumerate(rows, 1):
        where = f"{path.name} row {number}"
        if not isinstance(row, dict) or set(row) - KEYS or not {"id", "reason"} <= set(row):
            raise RemovedError(f"{where} has the keys id, versions, reason and time; it has {sorted(row) if isinstance(row, dict) else row!r}")
        if not isinstance(row["id"], str) or not row["id"]:
            raise RemovedError(f"{where}: id is the extension's id, such as dev.alice.pomodoro")
        versions = row.get("versions")
        if versions is not None and not (isinstance(versions, list) and versions and all(isinstance(v, str) for v in versions)):
            raise RemovedError(f"{where}: versions is null for every version or a list of version strings")
        if row["reason"] not in REASONS:
            raise RemovedError(f"{where}: reason is one of {', '.join(REASONS)}; it is {row['reason']!r}")
        time = row.get("time")
        if time is not None:
            try:
                parsed = datetime.fromisoformat(time[:-1] + "+00:00") if isinstance(time, str) and time.endswith("Z") else None
            except ValueError:
                parsed = None
            if parsed is None or parsed.utcoffset() is None:
                raise RemovedError(f"{where}: time is ISO 8601 in UTC, such as 2026-12-02T09:00:00Z; it is {time!r}")
    return rows


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "removed.json")
    try:
        rows = read_removed(path)
    except RemovedError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"{path.name}: {len(rows)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())

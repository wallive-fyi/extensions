#!/usr/bin/env python3
"""Prints the folders under extensions/ that differ between two commits and exist at the second, one a line.

    changed.py <base> <head>

A folder deleted at <head> is left out: the index drops it, and its published zips stay on the host.
"""

import subprocess
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: changed.py <base> <head>", file=sys.stderr)
        return 2
    base, head = sys.argv[1:]
    names = subprocess.run(["git", "diff", "--name-only", "-z", base, head, "--", "extensions/"],
                           check=True, capture_output=True).stdout.decode().split("\0")
    folders = sorted({Path(n).parts[1] for n in names if len(Path(n).parts) > 2})
    for folder in folders:
        if Path("extensions", folder, "wallive.toml").is_file():
            print(folder)
    return 0


if __name__ == "__main__":
    sys.exit(main())

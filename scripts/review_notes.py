#!/usr/bin/env python3
"""Writes the pull request comment a reviewer starts from: what each changed folder asks for and what grows its reach.

    review_notes.py --base <sha> [--installed <dir>] <folder> ...

For each folder: new or the version it moves from, its permission groups, reads and hooks, the ones an update adds,
the files it adds under bin/, the dependencies it adds, their licenses (from <dir>/<folder>/node_modules, where the
check installed them; GPL-family licenses flagged), and each line of its source that calls sys.shell,
sys.files.write, fetch or curl. Markdown on standard output.
"""

import argparse
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path

REACH = re.compile(r"sys\.shell|sys\.files\.write|\bfetch\s*\(|\bcurl\b")
SKIPPED = {"node_modules", ".wallive", ".git", "media", "game"}
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".sh", ".bash", ".py", ".gd", ""}
COPYLEFT = re.compile(r"\b(A?GPL|LGPL)", re.IGNORECASE)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def at_base(base: str, path: str) -> str | None:
    try:
        return git("show", f"{base}:{path}")
    except subprocess.CalledProcessError:
        return None


def grants(manifest: dict) -> dict:
    hooks = []
    for hook in manifest.get("hook", []):
        source, slash, _ = hook.get("on", "").partition("/")
        if slash and source != manifest.get("id") and source not in hooks:
            hooks.append(source)
    return {"groups": manifest.get("permissions", []), "reads": manifest.get("reads", []), "hooks": hooks}


def dependencies(text: str | None) -> dict:
    if not text:
        return {}
    package = json.loads(text)
    return {**package.get("dependencies", {}), **package.get("devDependencies", {})}


def licenses(installed: Path | None, folder: str) -> list:
    if not installed:
        return []
    modules = installed / folder / "node_modules"
    found = []
    for manifest in sorted(modules.glob("*/package.json")) + sorted(modules.glob("@*/*/package.json")):
        package = json.loads(manifest.read_text(encoding="utf-8"))
        license_ = package.get("license") or "none stated"
        if isinstance(license_, dict):
            license_ = license_.get("type", "none stated")
        found.append((package.get("name", manifest.parent.name), package.get("version", "?"), str(license_)))
    return found


def reach(folder: Path) -> list:
    lines = []
    for path in sorted(folder.rglob("*")):
        relative = path.relative_to(folder)
        if not path.is_file() or relative.parts[0] in SKIPPED or path.suffix not in SOURCE_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if REACH.search(line):
                lines.append(f"`{relative}:{number}` `{line.strip()[:120]}`")
    return lines


def section(base: str, name: str, installed: Path | None) -> list:
    folder = Path("extensions", name)
    with (folder / "wallive.toml").open("rb") as f:
        manifest = tomllib.load(f)
    old_text = at_base(base, f"extensions/{name}/wallive.toml")
    old = tomllib.loads(old_text) if old_text else None
    now = grants(manifest)
    out = [f"### {manifest['id']} ({name})", ""]
    out.append(f"- Update: {old.get('version', '?')} → {manifest['version']}" if old else f"- New: {manifest['version']}")
    for key, title in (("groups", "Permission groups"), ("reads", "Reads"), ("hooks", "Hooks receive events of")):
        out.append(f"- {title}: {', '.join(now[key]) or 'none'}")
        if old:
            added = [g for g in now[key] if g not in grants(old)[key]]
            if added:
                out.append(f"  - **adds {', '.join(added)}**")
    added_bin = [line for line in git("diff", "--name-only", "--diff-filter=A", base, "--", f"extensions/{name}/bin/").splitlines()]
    if added_bin:
        out.append("- Adds under bin/: " + ", ".join(f"`{Path(p).relative_to(folder)}`" for p in added_bin))
    before = dependencies(at_base(base, f"extensions/{name}/package.json"))
    after = dependencies((folder / "package.json").read_text(encoding="utf-8") if (folder / "package.json").is_file() else None)
    new_deps = [f"`{k}@{v}`" for k, v in after.items() if k not in before]
    if new_deps:
        out.append("- **New dependencies:** " + ", ".join(new_deps))
    installed_licenses = licenses(installed, name)
    if installed_licenses:
        out.append("- Installed packages and licenses:")
        for package, version, license_ in installed_licenses:
            flag = " **(copyleft: check it fits the extension's license)**" if COPYLEFT.search(license_) else ""
            out.append(f"  - `{package}@{version}`: {license_}{flag}")
    calls = reach(folder)
    out.append("- Lines that reach past the groups: " + ("none" if not calls else ""))
    out.extend(f"  - {line}" for line in calls)
    out.append("")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="The reviewer's comment for a pull request to the registry.")
    parser.add_argument("--base", required=True, help="the commit the pull request is based on")
    parser.add_argument("--installed", help="the packages folder where the check installed each folder's dependencies")
    parser.add_argument("folders", nargs="*")
    args = parser.parse_args()
    lines = ["## What this pull request asks for", ""]
    if not args.folders:
        lines.append("No extension folder changed.")
    for name in args.folders:
        lines.extend(section(args.base, name, Path(args.installed) if args.installed else None))
    lines.append("The check reads the source; a reviewer reads each line above against the README and the review rules in CONTRIBUTING.md.")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())

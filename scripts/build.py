#!/usr/bin/env python3
"""Builds the store's artifacts and index from the registry's folders.

    build.py --registry . --out build --commit <sha> --wallive <version> [--previous index.json] [--time <ISO 8601>] [folder ...]

For each folder named, it writes build/a/<id>/<version>.zip, unless --previous lists that version with the same
SHA-256, and the media under build/media/<id>/. Then it writes build/index.json, format 1, from every folder's
manifest: the folders built now take their new artifact, the others keep the artifact and versions of --previous, and
removed.json is checked and copied in. The index is not signed here; sign.swift signs its exact bytes.

A zip leaves out .wallive/, game/, media/ and .git, holds its entries in sorted order with one fixed time, and keeps
the executable bit, so one commit gives one SHA-256. Run the production `bun install` and the game exports in the
folder before this script: their node_modules/ and packs go into the zip.

Python 3.11 or later (tomllib); no package outside the standard library.
"""

import argparse
import hashlib
import io
import json
import os
import sys
import tomllib
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from check_removed import RemovedError, read_removed

FORMAT = 1
LEFT_OUT = {".wallive", "game", "media", ".git"}
# The time every entry of a zip carries; the earliest a zip can hold.
ZIP_TIME = (1980, 1, 1, 0, 0, 0)
# Each exported pack, in MiB as `wallive pkg check --store` counts the folder and media.
PACK_LIMIT = 64 * 1024 * 1024
# The built zip: StoreIndex.artifactLimit in the app, in bytes, so every zip the builder writes is one Wallive downloads.
ZIP_LIMIT = 80_000_000
MEDIA_FILES = ("icon.svg", "README.md")
SCREENSHOT_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")


class BuildError(Exception):
    """A folder the store cannot publish; the message names the folder and the fix."""


def main() -> int:
    args = parse_args()
    registry = Path(args.registry).resolve()
    out = Path(args.out).resolve()
    previous = load_previous(args.previous)
    folders = args.folders
    try:
        built = {folder: build_folder(registry / "extensions" / folder, out, previous) for folder in folders}
        index = write_index(registry, out, previous, built, args)
    except BuildError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"index.json: {len(index['extensions'])} extensions, {len(built)} built, {len(index['removed'])} removed")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the store's artifacts and index.json.")
    parser.add_argument("--registry", required=True, help="the registry checkout")
    parser.add_argument("--out", required=True, help="where a/, media/ and index.json go")
    parser.add_argument("--commit", required=True, help="the commit of main the build reads")
    parser.add_argument("--wallive", required=True, help="the Wallive version an entry without its own wallive key needs")
    parser.add_argument("--previous", help="the index the host serves now; its artifacts stay for folders not built")
    parser.add_argument("--time", help="the index's generated time, ISO 8601 in UTC; now by default")
    parser.add_argument("folders", nargs="*", help="folders under extensions/ to build; with none, the index is written again from --previous, as after a change to removed.json alone")
    return parser.parse_args()


def load_previous(path: str | None) -> dict:
    if not path:
        return {}
    index = json.loads(Path(path).read_text(encoding="utf-8"))
    return {entry["id"]: entry for entry in index.get("extensions", [])}


# MARK: - Manifests


def read_manifest(folder: Path) -> dict:
    manifest_file = folder / "wallive.toml"
    if not manifest_file.is_file():
        raise BuildError(f"{folder.name} has no wallive.toml")
    with manifest_file.open("rb") as f:
        manifest = tomllib.load(f)
    for key in ("id", "name", "version"):
        if key not in manifest:
            raise BuildError(f"{folder.name}/wallive.toml has no {key}. Run wallive pkg check --store on it.")
    return manifest


def read_locale(folder: Path, tag: str) -> dict:
    path = folder / "locales" / f"{tag}.toml"
    if not path.is_file():
        return {}
    with path.open("rb") as f:
        return tomllib.load(f)


def texts(manifest: dict, english: dict, field: str) -> dict:
    """{language: text} for a top-level text field: the manifest's in its language, English from locales/en.toml."""
    language = manifest.get("language", "zh-Hans")
    result = {}
    if field in manifest:
        result[language] = manifest[field]
    if field in english:
        result["en"] = english[field]
    return result


def event_sources(manifest: dict) -> list:
    """The other extensions whose events the hooks receive, as Manifest.eventSources reads them."""
    seen = []
    for hook in manifest.get("hook", []):
        source, slash, _ = hook.get("on", "").partition("/")
        if slash and source != manifest["id"] and source not in seen:
            seen.append(source)
    return seen


def commands(manifest: dict, english: dict) -> list:
    result = []
    for command in manifest.get("command", []):
        if command.get("hidden"):
            continue
        title = {}
        if "title" in command:
            title[manifest.get("language", "zh-Hans")] = command["title"]
        english_title = english.get("command", {}).get(command["name"], {}).get("title")
        if english_title:
            title["en"] = english_title
        result.append({"name": command["name"], "title": title})
    return result


def runtime(folder: Path) -> str:
    return "bun" if (folder / "package.json").is_file() else "bash"


# MARK: - Artifacts


def build_folder(folder: Path, out: Path, previous: dict) -> dict:
    """Zips the folder and copies its media; returns the artifact of the index entry."""
    manifest = read_manifest(folder)
    ext_id, version = manifest["id"], manifest["version"]
    data = zip_folder(folder)
    digest = hashlib.sha256(data).hexdigest()
    old = previous.get(ext_id)
    if old and version in old.get("versions", []) and (old["version"] != version or old["artifact"]["sha256"] != digest):
        raise BuildError(f"{folder.name} changed and names version {version}, which the host serves. Raise version in wallive.toml and add its CHANGELOG.md heading.")
    for game in manifest.get("games", []):
        pack = folder / game["pack"]
        if pack.is_file() and pack.stat().st_size > PACK_LIMIT:
            raise BuildError(f"{folder.name}/{game['pack']} is {pack.stat().st_size} bytes; a pack is at most {PACK_LIMIT}.")
    if len(data) > ZIP_LIMIT:
        raise BuildError(f"{folder.name} zips to {len(data)} bytes; the store takes {ZIP_LIMIT}.")
    path = f"a/{ext_id}/{version}.zip"
    # A change outside the zip (media/, the Godot project when the pack is the same) keeps the zip the host serves;
    # upload.sh writes each zip under a/ once and fails on one the host has.
    if not (old and old["version"] == version and old["artifact"]["sha256"] == digest):
        target = out / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return {"path": path, "sha256": digest, "bytes": len(data), "media": copy_media(folder, out, ext_id)}


def zip_folder(folder: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files(folder):
            relative = path.relative_to(folder).as_posix()
            info = zipfile.ZipInfo(relative, date_time=ZIP_TIME)
            info.external_attr = (0o100755 if os.access(path, os.X_OK) else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    return buffer.getvalue()


def files(folder: Path) -> list:
    """Regular files under the folder, LEFT_OUT folders at its top skipped, in byte order of their paths."""
    found = []
    for root, dirs, names in os.walk(folder):
        here = Path(root)
        if here == folder:
            dirs[:] = [d for d in dirs if d not in LEFT_OUT]
        for name in names:
            path = here / name
            if path.is_symlink():
                raise BuildError(f"{path.relative_to(folder)} is a symbolic link. The store takes regular files.")
            found.append(path)
    return sorted(found, key=lambda p: p.relative_to(folder).as_posix().encode())


def copy_media(folder: Path, out: Path, ext_id: str) -> dict:
    """icon.svg, README.md and media/'s screenshots under media/<id>/; their paths for the index."""
    target = out / "media" / ext_id
    target.mkdir(parents=True, exist_ok=True)
    media = {}
    for name in MEDIA_FILES:
        if (folder / name).is_file():
            (target / name).write_bytes((folder / name).read_bytes())
            media["icon" if name == "icon.svg" else "readme"] = f"media/{ext_id}/{name}"
    shots = sorted(p for p in (folder / "media").glob("*") if p.suffix.lower() in SCREENSHOT_SUFFIXES) if (folder / "media").is_dir() else []
    for shot in shots:
        (target / shot.name).write_bytes(shot.read_bytes())
    media["screenshots"] = [f"media/{ext_id}/{shot.name}" for shot in shots]
    return media


# MARK: - The index


def entry(folder: Path, artifact: dict, old: dict | None, wallive: str, time: str) -> dict:
    manifest = read_manifest(folder)
    english = read_locale(folder, "en")
    version = manifest["version"]
    versions = list(old.get("versions", [])) if old else []
    if version not in versions:
        versions.append(version)
    media = artifact.get("media", {})
    return {
        "id": manifest["id"],
        "folder": folder.name,
        "version": version,
        "name": texts(manifest, english, "name"),
        "description": texts(manifest, english, "description"),
        "author": manifest.get("author"),
        "license": manifest.get("license"),
        "icon": media.get("icon"),
        "categories": manifest.get("categories", []),
        "permissions": manifest.get("permissions", []),
        "reads": manifest.get("reads", []),
        "hooks": event_sources(manifest),
        "commands": commands(manifest, english),
        "games": [{"id": g["id"], "title": g.get("title", g["id"])} for g in manifest.get("games", [])],
        "runtime": runtime(folder),
        "wallive": manifest.get("wallive", wallive),
        "artifact": {"path": artifact["path"], "sha256": artifact["sha256"], "bytes": artifact["bytes"]},
        "readme": media.get("readme"),
        "screenshots": media.get("screenshots", []),
        "updated": time if (not old or old.get("version") != version) else old.get("updated", time),
        "versions": versions,
    }


def write_index(registry: Path, out: Path, previous: dict, built: dict, args: argparse.Namespace) -> dict:
    time = args.time or datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    entries = []
    for folder in sorted(p for p in (registry / "extensions").iterdir() if (p / "wallive.toml").is_file()):
        manifest = read_manifest(folder)
        old = previous.get(manifest["id"])
        artifact = built.get(folder.name)
        if artifact is None:
            if not old or old["version"] != manifest["version"]:
                raise BuildError(f"{folder.name} is at version {manifest['version']} and was not built. Build it: build.py ... {folder.name}")
            artifact = dict(old["artifact"], media={"icon": old.get("icon"), "readme": old.get("readme"), "screenshots": old.get("screenshots", [])})
        entries.append(entry(folder, artifact, old, args.wallive, time))
    ids = [e["id"] for e in entries]
    if len(ids) != len(set(ids)):
        raise BuildError("two folders hold one id: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    try:
        removed = read_removed(registry / "removed.json")
    except RemovedError as error:
        raise BuildError(str(error)) from error
    index = {"format": FORMAT, "generated": time, "commit": args.commit, "extensions": entries, "removed": removed}
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.json").write_bytes(json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return index


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Exports each game of a folder's [[games]] with Godot into the pack path the manifest names.

    GODOT=<Godot 4.7.2> export_games.py <folder>

A folder with one game keeps its Godot project in game/; a folder with several keeps each in game/<game id>/. The
export runs headless with the preset `Wallive` and needs no export templates (experiment E1). A folder without
[[games]] exports nothing. The registry's checks refuse a scene node without unique_id, so one commit exports to one
pack.
"""

import os
import subprocess
import sys
import tomllib
from pathlib import Path


def project(folder: Path, game_id: str, count: int) -> Path:
    path = folder / "game" / game_id if count > 1 else folder / "game"
    if not (path / "project.godot").is_file():
        raise SystemExit(f"error: {folder.name} has no Godot project at {path.relative_to(folder)}/project.godot for game {game_id}.")
    return path


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: export_games.py <folder>", file=sys.stderr)
        return 2
    folder = Path(sys.argv[1]).resolve()
    with (folder / "wallive.toml").open("rb") as f:
        games = tomllib.load(f).get("games", [])
    if not games:
        return 0
    godot = os.environ.get("GODOT")
    if not godot:
        print("error: GODOT names Godot 4.7.2's binary; this folder has [[games]].", file=sys.stderr)
        return 1
    for game in games:
        source = project(folder, game["id"], len(games))
        pack = (folder / game["pack"]).resolve()
        if folder not in pack.parents:
            raise SystemExit(f"error: {folder.name}'s game {game['id']} names the pack {game['pack']}, outside the folder.")
        pack.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([godot, "--headless", "--path", str(source), "--export-pack", "Wallive", str(pack)], check=True)
        print(f"exported {game['id']} to {pack.relative_to(folder)} ({pack.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

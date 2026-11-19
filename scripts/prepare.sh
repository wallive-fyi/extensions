#!/bin/bash
# Readies one extension folder for the check or the zip, in a copy and not in the checkout:
#
#   scripts/prepare.sh check <folder>          copies extensions/<folder> to $WALLIVE_HOME/packages/<folder>, installs
#                                              its dev dependencies, writes the SDK copy, exports its games and runs
#                                              `wallive pkg check --store` on it
#   scripts/prepare.sh publish <folder> <dir>  in <dir>/extensions/<folder>, a copy of the checkout, installs the
#                                              production dependencies and exports the games that go into the zip
#
# Environment: WALLIVE (the CLI, with Wallive_WalliveStrings.bundle and Wallive_WalliveCore.bundle beside it),
# WALLIVE_HOME (a throwaway data folder), GODOT (Godot 4.7.2's binary, for folders with [[games]]), and Bun 1.3 or
# later on PATH with BUN_INSTALL set, for folders with a package.json. `--ignore-scripts` keeps a dependency's install
# script from running on the runner.
set -euo pipefail

mode="${1:?usage: prepare.sh check|publish <folder> [<dir>]}"
folder="${2:?usage: prepare.sh check|publish <folder> [<dir>]}"
here="$(cd "$(dirname "$0")" && pwd)"
case "$folder" in */* | .* | "") echo "error: $folder is not a folder name under extensions/" >&2; exit 1 ;; esac

case "$mode" in
check)
    : "${WALLIVE:?WALLIVE names the wallive CLI}" "${WALLIVE_HOME:?WALLIVE_HOME names a throwaway data folder}"
    target="$WALLIVE_HOME/packages/$folder"
    rm -rf "$target"
    mkdir -p "$WALLIVE_HOME/packages"
    cp -R "extensions/$folder" "$target"
    ;;
publish)
    target="${3:?usage: prepare.sh publish <folder> <dir>}/extensions/$folder"
    [ -d "$target" ] || { echo "error: $target is not in the copy" >&2; exit 1; }
    ;;
*)
    echo "usage: prepare.sh check|publish <folder> [<dir>]" >&2
    exit 2
    ;;
esac

if [ -f "$target/package.json" ]; then
    if [ "$mode" = check ]; then
        (cd "$target" && bun install --frozen-lockfile --ignore-scripts)
    else
        (cd "$target" && bun install --frozen-lockfile --ignore-scripts --production)
    fi
fi

python3 "$here/export_games.py" "$target"

if [ "$mode" = check ]; then
    id="$(python3 -c 'import sys, tomllib; print(tomllib.load(open(sys.argv[1], "rb"))["id"])' "$target/wallive.toml")"
    if [ -f "$target/package.json" ] || [ -f "$target/tsconfig.json" ]; then
        "$WALLIVE" pkg sdk "$id"
    fi
    "$WALLIVE" pkg check --store "$target"
fi

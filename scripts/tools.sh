#!/bin/bash
# Puts the tools the check and the build need in $RUNNER_TEMP/tools and writes WALLIVE, WALLIVE_HOME and GODOT to
# $GITHUB_ENV:
#
# - the `wallive` CLI of a Wallive release, with Wallive_WalliveStrings.bundle (its text) and Wallive_WalliveCore.bundle
#   (`pkg new` and `pkg sdk`) beside it (experiment E4), from the repository variables WALLIVE_CLI_URL, a zip holding
#   the three, and WALLIVE_CLI_SHA256;
# - Godot 4.7.2 for exports, no export templates needed (experiment E1), checked against GODOT_SHA256.
#
# A released CLI is a prerequisite of the developer's (plans/marketplace.md, productization step 1); until the
# variables are set the job fails here with the variable it needs.
set -euo pipefail

: "${WALLIVE_CLI_URL:?the repository variable WALLIVE_CLI_URL is not set: no released wallive CLI to check with.}"
: "${WALLIVE_CLI_SHA256:?the repository variable WALLIVE_CLI_SHA256 is not set.}"
: "${GODOT_SHA256:?the repository variable GODOT_SHA256 is not set.}"
godot_url="https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_macos.universal.zip"

tools="$RUNNER_TEMP/tools"
mkdir -p "$tools"

fetch() {
    curl -fsSL --retry 3 -o "$2" "$1"
    echo "$3  $2" | shasum -a 256 -c -
}

fetch "$WALLIVE_CLI_URL" "$tools/wallive.zip" "$WALLIVE_CLI_SHA256"
ditto -x -k "$tools/wallive.zip" "$tools/wallive"
for need in wallive Wallive_WalliveStrings.bundle Wallive_WalliveCore.bundle; do
    [ -e "$tools/wallive/$need" ] || { echo "error: the CLI zip has no $need at its root." >&2; exit 1; }
done

fetch "$godot_url" "$tools/godot.zip" "$GODOT_SHA256"
ditto -x -k "$tools/godot.zip" "$tools/godot"

{
    echo "WALLIVE=$tools/wallive/wallive"
    echo "WALLIVE_HOME=$RUNNER_TEMP/wallive-home"
    echo "GODOT=$tools/godot/Godot.app/Contents/MacOS/Godot"
} >> "$GITHUB_ENV"
"$tools/wallive/wallive" --version || true

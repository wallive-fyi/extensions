# Wallive extensions

The source of every extension in Wallive's store. Each folder under `extensions/` is one extension; a merge to `main` builds it, signs the index and publishes both to the store's host, where Wallive reads them. The design is in Wallive's `plans/marketplace.md`; what the app does with the index is in `docs/store.md`.

## Layout

```
extensions/<folder>/          one extension: wallive.toml, bin/ or src/, locales/, icon.svg, README.md, CHANGELOG.md,
                              media/ (screenshots), game/ (a Godot project, for [[games]])
.github/workflows/check.yml   on a pull request: the checks, and a comment for the reviewer
.github/workflows/publish.yml on a merge to main: build, sign, upload
scripts/                      the steps the workflows run
removed.json                  takedowns: [{id, versions, reason, time}]
```

The folder is the extension's directory name on a user's Mac; the manifest's `id` is its key everywhere else. A folder with one game keeps its Godot project in `game/`, a folder with several in `game/<game id>/`.

## Adding or updating an extension

1. Run `wallive pkg check --store <folder>` on your package until it prints no error. It holds the store's rules: a SemVer `version`, a `CHANGELOG.md` heading for it, a `license` and a `LICENSE` file, categories, sizes, and no `.wallive/` or `node_modules/` unless your `.gitignore` lists them.
2. Copy the folder to `extensions/<folder>/` and open a pull request. An update raises `version` and adds its `CHANGELOG.md` heading; a version the store has published is not built again.
3. The check runs on a macOS runner and comments with what the extension asks for. A maintainer reviews against [CONTRIBUTING.md](CONTRIBUTING.md) and merges.

## What a merge publishes

For each folder the merge changed, `publish.yml` installs the production dependencies (`bun install --frozen-lockfile --ignore-scripts --production`), exports the games with Godot 4.7.2, and zips the folder without `.wallive/`, `game/`, `media/` and `.git`, in sorted order with one fixed time, so a commit gives one SHA-256. It writes `index.json` from every folder's manifest and `removed.json`, signs its exact bytes with the store's Ed25519 key into `index.json.sig`, and uploads the new zips under `a/<id>/<version>.zip`, the media under `media/<id>/`, then the index and its signature. A published zip is not written over, so an older version stays at its address.

The zip carries `node_modules/`. A TypeScript extension in the store does not depend on Bun's auto-install at run time.

## Scripts

| Script | Does |
|---|---|
| `scripts/changed.py <base> <head>` | the folders under `extensions/` that changed and exist at `<head>` |
| `scripts/prepare.sh check <folder>` | copies the folder to a throwaway `WALLIVE_HOME`, installs the dev dependencies, writes the SDK copy, exports the games, runs `wallive pkg check --store` |
| `scripts/prepare.sh publish <folder> <dir>` | in a copy of the checkout, installs the production dependencies and exports the games |
| `scripts/export_games.py <folder>` | exports each `[[games]]` entry with `GODOT` into its `pack` |
| `scripts/review_notes.py --base <sha> <folder> ...` | the reviewer's comment: groups, what an update adds, new `bin/` files and dependencies, licenses, lines that call `sys.shell`, `sys.files.write`, `fetch` or `curl` |
| `scripts/check_removed.py` | refuses a row of `removed.json` that Wallive would skip |
| `scripts/build.py` | the zips, media and `index.json` |
| `swift scripts/sign.swift [--verify] <index.json>` | signs `index.json` into `index.json.sig` with `STORE_SIGNING_KEY`, or checks a served one |
| `scripts/upload.sh <build>` | uploads a build to the host |
| `scripts/tools.sh` | fetches the `wallive` CLI with its two bundles and Godot, checked by SHA-256 |
| `python3 -m unittest discover scripts` | the scripts' tests |

The scripts need Python 3.11 or later and nothing outside its standard library; `sign.swift` needs Swift on macOS (CryptoKit).

## Setup the workflows need

None of this exists yet; each item is the maintainer's to provide.

| Setting | Kind | Holds |
|---|---|---|
| `WALLIVE_CLI_URL`, `WALLIVE_CLI_SHA256` | repository variables | a zip of a released `wallive` CLI with `Wallive_WalliveStrings.bundle` and `Wallive_WalliveCore.bundle` at its root, and its SHA-256 |
| `GODOT_SHA256` | repository variable | the SHA-256 of Godot 4.7.2's macOS zip |
| `WALLIVE_MINIMUM` | repository variable | the Wallive version an extension without a `wallive` key needs |
| `STORE_HOST` | repository variable | the store's host name, `store.wallive.fyi` |
| `store` | environment, protected | allows the publish job alone; holds the two secrets below |
| `STORE_SIGNING_KEY` | environment secret | the base64 of the raw 32-byte Ed25519 private key whose public half Wallive compiles in (`StoreIndex.publicKeys`) |
| `STORE_UPLOAD_TOKEN` | environment secret | the host's upload token |

`scripts/upload.sh` fails until the host's upload call is written in its `put`. CODEOWNERS, which ties a folder to its author, is not generated yet.

## Taking an extension down

Add a row to `removed.json` and merge it: `{"id": "dev.bob.clip", "versions": null, "reason": "malware", "time": "2026-12-02T09:00:00Z"}`. `versions: null` covers every version, a list the versions it names; `reason` is `malware`, `broken`, `author` or `policy`. At its next read of the index, each Wallive with a covered store install turns it off and keeps its folder and data; for `author` and `broken` the user can turn it back on. Wallive no longer lists or installs a covered version.

## License

The repository's own files are MIT. Each extension carries its own license file.

"""Tests of build.py and check_removed.py: python3 -m unittest discover scripts

What the app's side cannot see: Wallive's StoreRegistryBuildTests install one built folder, and these hold the rules
of a build across runs and folders.
"""

import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build  # noqa: E402
from check_removed import RemovedError, read_removed  # noqa: E402

MANIFEST = """id = "{id}"
name = "番茄钟"
version = "{version}"
license = "MIT"

[[command]]
name = "start"
run = "bin/run"
"""


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.registry = self.root / "registry"
        (self.registry / "extensions").mkdir(parents=True)
        (self.registry / "removed.json").write_text("[]\n")

    def tearDown(self):
        self.temp.cleanup()

    def folder(self, name="pomodoro", ext_id="dev.alice.pomodoro", version="1.0.0", run="echo started"):
        folder = self.registry / "extensions" / name
        (folder / "bin").mkdir(parents=True, exist_ok=True)
        (folder / "wallive.toml").write_text(MANIFEST.format(id=ext_id, version=version))
        (folder / "bin" / "run").write_text(f"#!/bin/sh\n{run}\n")
        os.chmod(folder / "bin" / "run", 0o755)
        return folder

    def build(self, out, *folders, previous=None):
        args = [sys.executable, str(HERE / "build.py"), "--registry", str(self.registry), "--out", str(out), "--commit", "abc",
                "--wallive", "0.1.0", "--time", "2026-12-01T08:00:00.000Z"]
        if previous:
            args += ["--previous", str(previous)]
        return subprocess.run(args + list(folders), capture_output=True, text=True)

    def index(self, out):
        return json.loads((out / "index.json").read_text())

    def test_one_commit_gives_one_zip(self):
        """Catches a zip that differs across checkouts (file times, order, the umask) or carries what the store leaves
        out: two copies of a folder with different file times zip to one SHA-256, without .wallive/, game/ and media/,
        with the executable bit."""
        first = self.folder()
        for left_out in (".wallive/sdk/version.json", "media/1.png", "game/project.godot"):
            (first / left_out).parent.mkdir(parents=True, exist_ok=True)
            (first / left_out).write_text("x")
        data = build.zip_folder(first)
        os.utime(first / "bin" / "run", (0, 0))
        (first / "wallive.toml").touch()
        self.assertEqual(hashlib.sha256(build.zip_folder(first)).hexdigest(), hashlib.sha256(data).hexdigest())
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertEqual(archive.namelist(), ["bin/run", "wallive.toml"])
            self.assertEqual(archive.getinfo("bin/run").external_attr >> 16, 0o100755)

    def test_a_served_version_is_not_built_from_other_files(self):
        """Catches a changed folder published under a version the host serves, which would change the bytes behind a
        signed digest Macs hold, and a rebuild of an unchanged folder that writes its zip again."""
        self.folder()
        first = self.root / "one"
        self.assertEqual(self.build(first, "pomodoro").returncode, 0)

        unchanged = self.root / "two"
        result = self.build(unchanged, "pomodoro", previous=first / "index.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((unchanged / "a").exists(), "the served zip is not written again")
        self.assertEqual(self.index(unchanged)["extensions"][0]["artifact"], self.index(first)["extensions"][0]["artifact"])

        self.folder(run="echo changed")
        result = self.build(self.root / "three", "pomodoro", previous=first / "index.json")
        self.assertEqual(result.returncode, 1)
        self.assertIn("changed and names version 1.0.0, which the host serves", result.stderr)

        self.folder(version="1.1.0", run="echo changed")
        result = self.build(self.root / "four", "pomodoro", previous=first / "index.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.index(self.root / "four")["extensions"][0]["versions"], ["1.0.0", "1.1.0"])

    def test_a_folder_not_built_keeps_its_artifact_or_fails(self):
        """Catches an index that drops or invents the artifact of a folder the merge did not touch: with no folder
        named, each entry keeps the served artifact; a folder at a new version that was not built fails."""
        self.folder()
        first = self.root / "one"
        self.assertEqual(self.build(first, "pomodoro").returncode, 0)
        (self.registry / "removed.json").write_text('[{"id": "dev.bob.clip", "versions": null, "reason": "malware", "time": "2026-12-02T09:00:00Z"}]')

        again = self.root / "two"
        result = self.build(again, previous=first / "index.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.index(again)["extensions"][0]["artifact"], self.index(first)["extensions"][0]["artifact"])
        self.assertEqual(self.index(again)["removed"][0]["id"], "dev.bob.clip")

        self.folder(version="1.1.0")
        result = self.build(self.root / "three", previous=first / "index.json")
        self.assertEqual(result.returncode, 1)
        self.assertIn("is at version 1.1.0 and was not built", result.stderr)

    def test_two_folders_with_one_id_fail(self):
        """Catches an index with two entries for one id, of which Wallive would install either."""
        self.folder("pomodoro")
        self.folder("pomodoro-copy")
        result = self.build(self.root / "out", "pomodoro", "pomodoro-copy")
        self.assertEqual(result.returncode, 1)
        self.assertIn("two folders hold one id: dev.alice.pomodoro", result.stderr)


class RemovedTests(unittest.TestCase):
    def read(self, rows):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "removed.json"
            path.write_text(json.dumps(rows))
            return read_removed(path)

    def test_rows_wallive_would_skip_are_refused(self):
        """Catches a takedown Wallive drops without a word: its reader skips a row that does not decode, so a reason
        outside StoreTakedownReason or a time with an offset would leave the extension running on every Mac."""
        good = {"id": "dev.bob.clip", "versions": ["1.0.0"], "reason": "broken", "time": "2026-12-02T09:00:00.000Z"}
        self.assertEqual(self.read([good]), [good])
        for bad, message in (
            (dict(good, reason="spam"), "reason is one of malware, broken, author, policy"),
            (dict(good, time="2026-12-02T09:00:00+08:00"), "time is ISO 8601 in UTC"),
            (dict(good, versions="1.0.0"), "versions is null for every version"),
            (dict(good, note="x"), "has the keys id, versions, reason and time"),
        ):
            with self.assertRaises(RemovedError) as caught:
                self.read([bad])
            self.assertIn(message, str(caught.exception))


if __name__ == "__main__":
    unittest.main()

import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "staging/coordinated-backend/opal/owner-pwa-local-v1.0.13"
CANDIDATE_ZIP = PACKAGE / "hbnf-owner-pwa-local-v1.0.13.zip"
BASELINE_PACKAGE_SHA = "a24f480aa5dd9cdfc8fe5c415b277f4605db1c506054b8c9e5918bd03ccf62b6"
READBACK = ROOT / "evidence/owner-pwa-v112-tx02-direct-readback-20261024"
BASELINE_SHA = "054155fdca281f07d377fa1e03b33a127088499c6e97c59082a579587624cf80"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class OwnerPwaV113InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.www = self.root / "www"
        self.base = self.www / "mission-control-local"
        self.target = self.base / "owner-pwa"
        self.backup_root = self.root / "root"
        self.pkg = self.root / "package"
        self.bin = self.root / "bin"
        self.target.mkdir(parents=True)
        self.backup_root.mkdir()
        self.pkg.mkdir()
        self.bin.mkdir()
        self._materialize_baseline()
        self._materialize_mission_control()
        self._materialize_candidate()
        self._install_host_shims()

    def tearDown(self):
        self.temp.cleanup()

    def _materialize_baseline(self):
        with zipfile.ZipFile(CANDIDATE_ZIP) as candidate:
            rollback_bytes = candidate.read("ROLLBACK_BASELINE.zip")
        self.assertEqual(hashlib.sha256(rollback_bytes).hexdigest(), BASELINE_PACKAGE_SHA)
        with zipfile.ZipFile(io.BytesIO(rollback_bytes)) as archive:
            for name in archive.namelist():
                if name.startswith("owner-pwa/") and not name.endswith("/"):
                    out = self.target / name.split("/", 1)[1]
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(archive.read(name))
            payload_bytes = archive.read("PAYLOAD.SHA256SUMS")
            rollback_script = archive.read("rollback.sh")
        (self.target / ".hbnf-package-marker").write_text("hbnf-owner-pwa-local-v1\n")
        (self.target / ".hbnf-package-version").write_text("1.0.12\n")
        (self.target / ".hbnf-payload.sha256").write_bytes(payload_bytes.replace(b"owner-pwa/", b""))
        (self.target / ".hbnf-rollback.sh").write_bytes(rollback_script)
        baseline = READBACK / "BASELINE.SHA256SUMS"
        self.assertEqual(sha(baseline), BASELINE_SHA)
        shutil.copyfile(baseline, self.pkg / "BASELINE.SHA256SUMS")

    def _materialize_mission_control(self):
        source = ROOT / "staging/coordinated-backend/opal/mission-control-local"
        for name in ("index.html", "styles.css", "app.js", "local-transport.js"):
            shutil.copyfile(source / name, self.base / name)
        (self.base / ".hbnf-package-marker").write_text("hbnf-owner-pwa-empty-runtime-recovery-v2\n")
        (self.base / ".hbnf-package-version").write_text("1.0.2\n")

    def _materialize_candidate(self):
        shutil.copyfile(PACKAGE / "install.sh", self.pkg / "install.sh")
        shutil.copyfile(PACKAGE / "rollback.sh", self.pkg / "rollback.sh")
        candidate = self.pkg / "owner-pwa"
        candidate.mkdir()
        entries = []
        names = ["hbnf-faded-phosphor.png"] + [f"test-payload-{i:02d}.js" for i in range(16)]
        for name in names:
            data = ("fixture:" + name + "\n").encode()
            (candidate / name).write_bytes(data)
            entries.append(f"{hashlib.sha256(data).hexdigest()}  owner-pwa/{name}\n")
        (self.pkg / "PAYLOAD.SHA256SUMS").write_text("".join(entries))
        with zipfile.ZipFile(CANDIDATE_ZIP) as candidate:
            rollback_bytes = candidate.read("ROLLBACK_BASELINE.zip")
        rollback_zip = self.pkg / "ROLLBACK_BASELINE.zip"
        rollback_zip.write_bytes(rollback_bytes)
        (self.pkg / "ROLLBACK_BASELINE.SHA256").write_text(
            f"{sha(rollback_zip)}  ROLLBACK_BASELINE.zip\n"
        )

    def _install_host_shims(self):
        (self.bin / "id").write_text("#!/bin/sh\n[ \"${1:-}\" = -u ] && { echo 0; exit 0; }\nexec /usr/bin/id \"$@\"\n")
        (self.bin / "sha256sum").write_text(
            "#!/bin/sh\nif [ \"${1:-}\" = -c ]; then shift; exec /usr/bin/shasum -a 256 -c \"$@\"; fi\nexec /usr/bin/shasum -a 256 \"$@\"\n"
        )
        for path in (self.bin / "id", self.bin / "sha256sum"):
            path.chmod(0o755)

    def _run(self, script):
        env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}", HBNF_WWW_ROOT=str(self.www), HBNF_BACKUP_ROOT=str(self.backup_root))
        return subprocess.run(["/bin/sh", str(script)], cwd=self.pkg, env=env, capture_output=True, text=True)

    def test_install_and_rollback_restore_exact_v112_tree(self):
        result = self._run(self.pkg / "install.sh")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.target / ".hbnf-package-version").read_text(), "1.0.13\n")
        backup = self.backup_root / "hbnf-owner-pwa-local.rollback-OWNER-PWA-LOCAL-V113-UI-20261024-01"
        manifest = self.backup_root / "hbnf-owner-pwa-OWNER-PWA-LOCAL-V113-UI-20261024-01.BASELINE.SHA256SUMS"
        self.assertEqual(len(list(self.target.iterdir())), 21)
        self.assertEqual(len(list(backup.iterdir())), 20)
        self.assertEqual(sha(manifest), BASELINE_SHA)

        result = self._run(self.pkg / "rollback.sh")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.target / ".hbnf-package-version").read_text(), "1.0.12\n")
        check = subprocess.run(["/usr/bin/shasum", "-a", "256", "-c", str(manifest)], cwd=self.target, capture_output=True, text=True)
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
        self.assertEqual(len(list(self.target.iterdir())), 20)

    def test_mismatched_v112_baseline_stops_before_any_swap(self):
        changed = self.target / "hbnf-cart.html"
        changed.write_text("unexpected runtime content\n")
        result = self._run(self.pkg / "install.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(changed.read_text(), "unexpected runtime content\n")
        self.assertFalse((self.backup_root / "hbnf-owner-pwa-local.rollback-OWNER-PWA-LOCAL-V113-UI-20261024-01").exists())


if __name__ == "__main__":
    unittest.main()

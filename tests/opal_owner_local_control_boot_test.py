#!/usr/bin/env python3
"""Host regression checks for the OpenWrt gateway's volatile log path."""
from __future__ import annotations

import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INIT = ROOT / "staging/coordinated-backend/opal/owner-local-control/hbnf-owner-local-control.init"


class GatewayBootTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.log_dir = self.root / "var/log/gateway"
        self.conf = self.root / "nginx.conf"
        self.conf.write_text("valid config\n")
        self.trace = self.root / "trace"
        self.nginx = self.root / "nginx"
        self.nginx.write_text(
            "#!/bin/sh\n"
            "[ -d \"$TEST_LOG_DIR\" ] || exit 21\n"
            "python3 -c 'import os,stat,sys; sys.exit(0 if stat.S_IMODE(os.stat(sys.argv[1]).st_mode)==0o700 else 22)' \"$TEST_LOG_DIR\" || exit $?\n"
            "echo nginx-test >> \"$TEST_TRACE\"\n"
            "[ \"${NGINX_TEST_FAIL:-0}\" = 0 ]\n"
        )
        self.nginx.chmod(0o755)
        source = INIT.read_text().replace(
            "/etc/hbnf-local-control/nginx.conf", str(self.conf)
        ).replace("/usr/sbin/nginx", str(self.nginx)).replace(
            "/var/log/hbnf-owner-local-control-nginx", str(self.log_dir)
        )
        self.init = self.root / "service.init"
        self.init.write_text(source)
        self.driver = self.root / "driver.sh"
        self.driver.write_text(
            "#!/bin/sh\n"
            "procd_open_instance() { echo procd-open >> \"$TEST_TRACE\"; }\n"
            "procd_set_param() { :; }\n"
            "procd_close_instance() { echo procd-close >> \"$TEST_TRACE\"; }\n"
            ". \"$TEST_INIT\"\n"
            "start_service\n"
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def run_start(self, *, path: Path | None = None, fail_nginx: bool = False) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env.update({
            "TEST_INIT": str(self.init),
            "TEST_LOG_DIR": str(self.log_dir),
            "TEST_TRACE": str(self.trace),
            "NGINX_TEST_FAIL": "1" if fail_nginx else "0",
        })
        if path is not None:
            env["PATH"] = f"{path}:{env['PATH']}"
        return subprocess.run(["/bin/sh", str(self.driver)], env=env, text=True, capture_output=True)

    def test_recreates_volatile_log_directory_before_nginx_validation(self) -> None:
        result = self.run_start()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(stat.S_IMODE(self.log_dir.stat().st_mode), 0o700)
        trace = self.trace.read_text().splitlines()
        self.assertEqual(trace, ["nginx-test", "procd-open", "procd-close"])

    def test_repairs_existing_directory_permissions_before_nginx_validation(self) -> None:
        self.log_dir.mkdir(parents=True)
        self.log_dir.chmod(0o755)
        result = self.run_start()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(stat.S_IMODE(self.log_dir.stat().st_mode), 0o700)

    def test_nginx_validation_failure_does_not_register_service(self) -> None:
        result = self.run_start(fail_nginx=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.trace.read_text().splitlines(), ["nginx-test"])

    def test_log_directory_creation_failure_fails_before_nginx(self) -> None:
        fakebin = self.root / "bin"
        fakebin.mkdir()
        mkdir = fakebin / "mkdir"
        mkdir.write_text("#!/bin/sh\nexit 1\n")
        mkdir.chmod(0o755)
        result = self.run_start(path=fakebin)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.trace.exists())

    def test_log_directory_permission_failure_fails_before_nginx(self) -> None:
        self.log_dir.mkdir(parents=True)
        fakebin = self.root / "bin"
        fakebin.mkdir()
        chmod = fakebin / "chmod"
        chmod.write_text("#!/bin/sh\nexit 1\n")
        chmod.chmod(0o755)
        result = self.run_start(path=fakebin)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.trace.exists())

    def test_symlinked_log_path_fails_closed(self) -> None:
        outside = self.root / "outside"
        outside.mkdir()
        self.log_dir.parent.mkdir(parents=True)
        self.log_dir.symlink_to(outside, target_is_directory=True)
        result = self.run_start()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.trace.exists())

    def test_package_builder_requires_boot_path_guard(self) -> None:
        builder = (ROOT / "scripts/hbnf_build_owner_local_control_package.py").read_text()
        self.assertIn('[ ! -L "$LOG_DIR" ] || return 1', builder)
        self.assertIn('mkdir -p "$LOG_DIR" || return 1', builder)
        self.assertIn('chmod 0700 "$LOG_DIR" || return 1', builder)


if __name__ == "__main__":
    unittest.main()

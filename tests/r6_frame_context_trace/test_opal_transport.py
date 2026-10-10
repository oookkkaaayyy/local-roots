"""Offline regression tests for the evidence-backed Opal OTA fallback."""
import hashlib
import importlib.util
import pathlib
import tempfile
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/hbnf_r6_frame_context_diagnostic_transaction.py"
spec = importlib.util.spec_from_file_location("diag_transaction", SCRIPT)
tx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tx)


def test_opal_transfer_is_exact_and_single_request():
    with tempfile.TemporaryDirectory() as tmp:
        tx.OUT = pathlib.Path(tmp)
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs))
            if len(calls) == 1:
                exact = hashlib.sha256(kwargs["input"]).hexdigest() == tx.DIAG_SHA
                size = len(kwargs["input"]) == 1511456
                assert exact and size
                return type("P", (), {"returncode": 0, "stdout": f"OPAL_ARTIFACT_VERIFIED\n{tx.DIAG_SHA}  /tmp/hbnf-cart2-hbnf-r6-frame-context-diagnostic.bin\n1511456\n".encode(), "stderr": b""})()
            command = args[-1]
            assert "curl --silent --show-error" in command
            assert "-F 'update=@/tmp/hbnf-cart2-hbnf-r6-frame-context-diagnostic.bin;type=application/octet-stream'" in command
            assert "http://192.168.77.10/update" in command
            assert "UPDATE_OK" in command
            return type("P", (), {"returncode": 0, "stdout": "CURL_EXIT=0\nHTTP_STATUS=200\nUPDATE_OK\n<h2>Update successful!</h2>", "stderr": ""})()

        with patch.object(tx.subprocess, "run", side_effect=fake_run):
            receipt = tx.upload_once(tx.DIAG_BIN, pathlib.Path(tmp) / "diag-response.html", "opal")
        assert receipt["update_successful_text"] is True
        assert receipt["firmware_request_attempts"] == 1
        assert receipt["retry"] is False
        assert receipt["curl_exit"] == 0 and receipt["http_status"] == "200"
        assert len(calls) == 2  # one exact staging SSH operation and one WLED POST SSH operation


def test_opal_broken_pipe_is_not_retried():
    with tempfile.TemporaryDirectory() as tmp:
        tx.OUT = pathlib.Path(tmp)
        calls = []

        def fake_run(args, **kwargs):
            calls.append((args, kwargs))
            if len(calls) == 1:
                return type("P", (), {"returncode": 0, "stdout": f"OPAL_ARTIFACT_VERIFIED\n{tx.DIAG_SHA}  /tmp/hbnf-cart2-hbnf-r6-frame-context-diagnostic.bin\n1511456\n".encode(), "stderr": b""})()
            return type("P", (), {"returncode": 0, "stdout": "CURL_EXIT=55\nHTTP_STATUS=000\n", "stderr": "curl: (55) Send failure: Broken pipe\n"})()

        with patch.object(tx.subprocess, "run", side_effect=fake_run):
            try:
                tx.upload_once(tx.DIAG_BIN, pathlib.Path(tmp) / "diag-response.html", "opal")
            except RuntimeError as exc:
                assert "no retry" in str(exc)
            else:
                raise AssertionError("broken pipe must fail closed")
        assert len(calls) == 2  # exactly one WLED POST; no retry


if __name__ == "__main__":
    test_opal_transfer_is_exact_and_single_request()
    test_opal_broken_pipe_is_not_retried()
    print("PASS Opal transport fallback exact-byte staging, single-request, and no-retry cases")

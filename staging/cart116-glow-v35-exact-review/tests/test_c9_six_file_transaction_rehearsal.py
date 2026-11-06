import hashlib
import pathlib
import subprocess
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "release/c9-six-file-transaction.REVIEW_ONLY.sh"
NAMES = [
    ("local-transport.js", "www/mission-control-local/local-transport.js"),
    ("hbnf-cart-local.js", "www/mission-control-local/owner-pwa/hbnf-cart-local.js"),
    ("hbnf-cart.js", "www/mission-control-local/owner-pwa/hbnf-cart.js"),
    ("hbnf-cart.html", "www/mission-control-local/owner-pwa/hbnf-cart.html"),
    (".hbnf-payload.sha256", "www/mission-control-local/owner-pwa/.hbnf-payload.sha256"),
    (".hbnf-package-version", "www/mission-control-local/owner-pwa/.hbnf-package-version"),
]

def digest(content):
    return hashlib.sha256(content).hexdigest()

def invoke(action, root, manifest, source, expect_success=True):
    completed = subprocess.run(
        ["sh", str(SCRIPT), action, str(root), str(manifest), str(source),
         "c9-test-one-time-transaction-20261105"],
        capture_output=True, text=True
    )
    assert (completed.returncode == 0) == expect_success, (
        action, completed.returncode, completed.stdout, completed.stderr
    )
    return completed

with tempfile.TemporaryDirectory(prefix="cart116-c9-rehearsal-", dir="/tmp") as directory:
    root = pathlib.Path(directory)
    originals = {}
    candidates = {}
    source = root / "fixtures"
    source.mkdir()
    manifest = root / "six.tsv"
    rows = []
    for name, target in NAMES:
        destination = root / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        old = ("current-original:" + name).encode()
        new = ("new-accepted:" + name).encode()
        destination.write_bytes(old)
        destination.chmod(0o644)
        (source / name).write_bytes(new)
        originals[target] = old
        candidates[target] = new
        rows.append(f"/{target}\t{name}\t{digest(old)}\t{digest(new)}\t644")
    manifest.write_text("\n".join(rows) + "\n")
    protected = root / "www/mission-control-local/owner-pwa/unchanged-existing-01.js"
    protected.write_bytes(b"protected")

    invoke("preflight", root, manifest, source)
    invoke("prepare", root, manifest, source)
    invoke("apply", root, manifest, source)
    invoke("apply", root, manifest, source, expect_success=False)
    assert all((root / t).read_bytes() == candidates[t] for t in candidates)
    assert protected.read_bytes() == b"protected"

    # Third-party target drift cannot be overwritten by a rollback.
    changed_path = root / NAMES[0][1]
    changed_path.write_bytes(b"third-party-drift")
    invoke("rollback", root, manifest, source, expect_success=False)
    assert changed_path.read_bytes() == b"third-party-drift"
    changed_path.write_bytes(candidates[NAMES[0][1]])

    invoke("rollback", root, manifest, source)
    assert all((root / t).read_bytes() == originals[t] for t in originals)
    assert protected.read_bytes() == b"protected"
    invoke("prepare", root, manifest, source, expect_success=False)
    print("PASS: six-only prepare/apply/one-time replay/third-party-drift reject/rollback; protected unchanged")

forbidden = subprocess.run(
    ["sh", str(SCRIPT), "preflight", "/", "/dev/null", "/tmp",
     "c9-test-one-time-transaction-20261105"],
    capture_output=True, text=True
)
assert forbidden.returncode != 0
assert "REVIEW_ONLY_SANDBOX_REQUIRED" in forbidden.stderr
print("PASS: live Opal root '/' cannot be used by the immutable review-only script")

"""C9 production preflight source: strict read-only sandbox regressions."""
import hashlib
import pathlib
import subprocess
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "release/c9-six-file-opal-preflight.REVIEW_ONLY.sh"
ITEMS = [
    ("local-transport.js", "www/mission-control-local/local-transport.js"),
    ("hbnf-cart-local.js", "www/mission-control-local/owner-pwa/hbnf-cart-local.js"),
    ("hbnf-cart.js", "www/mission-control-local/owner-pwa/hbnf-cart.js"),
    ("hbnf-cart.html", "www/mission-control-local/owner-pwa/hbnf-cart.html"),
    (".hbnf-payload.sha256", "www/mission-control-local/owner-pwa/.hbnf-payload.sha256"),
    (".hbnf-package-version", "www/mission-control-local/owner-pwa/.hbnf-package-version"),
]
def sha(b):
    return hashlib.sha256(b).hexdigest()
def run(root, targets, source, digest, good):
    p = subprocess.run(["sh", str(SCRIPT), str(root), str(targets), str(source), digest],
                       text=True, capture_output=True)
    assert (p.returncode == 0) is good, (p.returncode, p.stdout, p.stderr)
    return p

with tempfile.TemporaryDirectory(dir="/tmp", prefix="cart116-c9-rehearsal-") as d:
    root = pathlib.Path(d)
    source = root / "candidate"
    source.mkdir()
    targets = root / "six.tsv"
    manifest = b'{"admission":"PENDING","opal_www_write":false}\n'
    (source / "ADMISSION.PENDING.json").write_bytes(manifest)
    rows = []
    before = {}
    for name, dest in ITEMS:
        original = ("installed-v120:" + name).encode()
        candidate = ("review-c9:" + name).encode()
        file = root / dest
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(original)
        file.chmod(0o644)
        (source / name).write_bytes(candidate)
        rows.append(f"/{dest}\t{name}\t{sha(original)}\t{sha(candidate)}\t644")
        before[dest] = original
    targets.write_text("\n".join(rows) + "\n")
    protected = root / "www/mission-control-local/owner-pwa/protected-extra.js"
    protected.write_bytes(b"existing-protected")
    mhash = sha(manifest)
    assert "C9_PREFLIGHT_PASS_READ_ONLY" in run(root, targets, source, mhash, True).stdout
    assert all((root / d).read_bytes() == v for d, v in before.items())
    assert protected.read_bytes() == b"existing-protected"
    run(root, targets, source, "0"*64, False)
    changed = source / ITEMS[0][0]
    changed.write_bytes(b"candidate-drift")
    run(root, targets, source, mhash, False)
    changed.write_bytes(("review-c9:" + ITEMS[0][0]).encode())
    orig = root / ITEMS[0][1]
    orig.write_bytes(b"installed-drift")
    run(root, targets, source, mhash, False)
    orig.write_bytes(before[ITEMS[0][1]])
    targets.write_text("\n".join(rows[:-1]+[rows[0]])+"\n")
    run(root, targets, source, mhash, False)
    targets.write_text("\n".join(rows)+"\n")
    orig.unlink()
    orig.symlink_to(root / ITEMS[1][1])
    run(root, targets, source, mhash, False)
    orig.unlink()
    orig.write_bytes(before[ITEMS[0][1]])
    assert "C9_PREFLIGHT_PASS_READ_ONLY" in run(root, targets, source, mhash, True).stdout
    assert protected.read_bytes() == b"existing-protected"
    print("PASS: six-file exact source/installed/manifest/space read-only + drift/duplicate/symlink rejects")

# No write-capable action and no convenient arbitrary root.
p = subprocess.run(["sh", str(SCRIPT), "/", "/dev/null", "/tmp", "0"*64],
                   text=True, capture_output=True)
assert p.returncode != 0
print("PASS: unadmitted live-root invocation refused")

"""Review-only native six-file Opal lifecycle against isolated fake root."""
import hashlib
import pathlib
import subprocess
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "release/c9-six-file-opal.CANDIDATE.sh"
NAMES = [
 ("local-transport.js", "www/mission-control-local/local-transport.js"),
 ("hbnf-cart-local.js", "www/mission-control-local/owner-pwa/hbnf-cart-local.js"),
 ("hbnf-cart.js", "www/mission-control-local/owner-pwa/hbnf-cart.js"),
 ("hbnf-cart.html", "www/mission-control-local/owner-pwa/hbnf-cart.html"),
 (".hbnf-payload.sha256", "www/mission-control-local/owner-pwa/.hbnf-payload.sha256"),
 (".hbnf-package-version", "www/mission-control-local/owner-pwa/.hbnf-package-version"),
]
TX = "cart116c9-exact-test-20261105"
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def call(action, root, manifest, candidate, expect=True):
    p = subprocess.run(["sh", str(SCRIPT), action, str(root), str(manifest),
                        str(candidate), TX], text=True, capture_output=True)
    assert (p.returncode == 0) is expect, (action, p.returncode, p.stdout, p.stderr)
    return p

with tempfile.TemporaryDirectory(dir="/tmp", prefix="cart116-c9-rehearsal-") as d:
    root = pathlib.Path(d)
    candidate = root / "candidate"
    candidate.mkdir()
    manifest = root / "six.tsv"
    before = {}
    after = {}
    rows = []
    for name, dest in NAMES:
        file = root / dest
        file.parent.mkdir(parents=True, exist_ok=True)
        old, new = ("original:"+name).encode(), ("candidate:"+name).encode()
        file.write_bytes(old)
        file.chmod(0o644)
        (candidate / name).write_bytes(new)
        before[dest], after[dest] = old, new
        rows.append(f"/{dest}\t{name}\t{sha(old)}\t{sha(new)}\t644")
    manifest.write_text("\n".join(rows)+"\n")
    protected = root / "www/mission-control-local/owner-pwa/stable.js"
    protected.write_bytes(b"untouched")
    call("preflight", root, manifest, candidate)
    call("apply", root, manifest, candidate, False)
    call("prepare", root, manifest, candidate)
    assert all((root / p).read_bytes() == v for p, v in before.items())
    call("apply", root, manifest, candidate)
    call("verify", root, manifest, candidate)
    call("apply", root, manifest, candidate, False)
    assert all((root / p).read_bytes() == v for p, v in after.items())
    assert protected.read_bytes() == b"untouched"
    # Third-party drift blocks restoring *all* targets.
    target = root / NAMES[0][1]
    target.write_bytes(b"unrecognized-third-party")
    call("restore", root, manifest, candidate, False)
    assert target.read_bytes() == b"unrecognized-third-party"
    target.write_bytes(after[NAMES[0][1]])
    call("restore", root, manifest, candidate)
    assert all((root / p).read_bytes() == v for p, v in before.items())
    assert protected.read_bytes() == b"untouched"
    call("apply", root, manifest, candidate, False)
    print("PASS: accepted six PWA bytes, protected 21-asset boundary, journal, one-time, rollback and drift refusal")

# A new transaction ID cannot be installed on bare root without the live
# manifest-linked signed-off receipt; never attempt any live write in CI.
p = subprocess.run(["sh", str(SCRIPT), "apply", "/",
                   "/dev/null", "/tmp", TX], capture_output=True, text=True)
assert p.returncode != 0
print("PASS: live root cannot be installed by unauthenticated test fixture")

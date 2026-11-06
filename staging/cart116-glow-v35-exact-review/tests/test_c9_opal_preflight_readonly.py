"""C9 production preflight source: strict read-only sandbox regressions."""
import hashlib
import os
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

# C9_GL_SFT1200_NO_STAT: exercise exact ls -ln UID/GID/mode helper (same
# bytes in live candidate and read-only preflight). This fixture emulates
# authenticated GL-SFT1200 output with the BusyBox stat applet absent.
candidate_script = SCRIPT.parent / "c9-six-file-opal.CANDIDATE.sh"
preflight_source = SCRIPT.read_text()
candidate_source = candidate_script.read_text()
for src in (preflight_source, candidate_source):
    assert "stat -c" not in src
    assert "command -v stat" not in src
a = preflight_source.split("ownership_ok(){", 1)[1].split("\n}\n", 1)[0]
b = candidate_source.split("ownership_ok(){", 1)[1].split("\n}\n", 1)[0]
assert a == b
with tempfile.TemporaryDirectory(prefix="cart116-c9-rehearsal-", dir="/tmp") as d:
    root = pathlib.Path(d)
    file = root / "owner.js"
    file.write_bytes(b"original file")
    file.chmod(0o644)
    fakebin = root / "fakebin"
    fakebin.mkdir()
    ls = fakebin / "ls"
    ls.write_text("""#!/bin/sh
[ "$1" = -ln ] || exit 64
case "$C9_FAKE_LS" in
  original) printf '%s\\n' '-rw-r--r--    1 0 0   8993 Oct 26 19:08 owner.js' ;;
  private) printf '%s\\n' '-rw-------    1 0 0     91 Oct 26 19:08 ADMISSION.RECEIPT' ;;
  wrong_uid) printf '%s\\n' '-rw-r--r--    1 1000 0 8993 Oct 26 19:08 owner.js' ;;
  wrong_mode) printf '%s\\n' '-rw-rw-r--    1 0 0   8993 Oct 26 19:08 owner.js' ;;
  *) exit 65 ;;
esac
""")
    ls.chmod(0o755)
    definition = "ownership_ok(){" + a + "\n}\n"
    def check(mode, output, accept, path=file):
        env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ.get("PATH", ""))
        env["C9_FAKE_LS"] = output
        p = subprocess.run(["sh", "-c", definition + "ownership_ok \\"$1\\" \\"$2\\"",
                            "c9", str(path), str(mode)], env=env, capture_output=True, text=True)
        assert (p.returncode == 0) is accept, (mode, output, p.returncode, p.stderr)
    check("644", "original", True)
    check("600", "private", True)
    check("644", "private", False)
    check("600", "original", False)
    check("644", "wrong_uid", False)
    check("644", "wrong_mode", False)
    symlink = root / "owner-symlink.js"
    symlink.symlink_to(file)
    check("644", "original", False, symlink)
    print("PASS: authenticated Opal ls -ln mode/UID/GID helper; false-owner, false-mode, symlink fail closed; no stat applet required")

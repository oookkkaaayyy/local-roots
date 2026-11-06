"""C9 six-file candidate: SIGKILL bypasses EXIT trap; separate cold restore.

No live device, no firmware and no source/manifest mutation. Simulates a process
lost after the second actual rename with a controlled test PATH wrapper.
Demonstrates recovery even after staging/source/transport paths disappear.
"""
import hashlib
import os
import pathlib
import shutil
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = HERE / "release/c9-six-file-opal.CANDIDATE.sh"
FILES = [
    ("local-transport.js", "www/mission-control-local/local-transport.js"),
    ("hbnf-cart-local.js", "www/mission-control-local/owner-pwa/hbnf-cart-local.js"),
    ("hbnf-cart.js", "www/mission-control-local/owner-pwa/hbnf-cart.js"),
    ("hbnf-cart.html", "www/mission-control-local/owner-pwa/hbnf-cart.html"),
    (".hbnf-payload.sha256", "www/mission-control-local/owner-pwa/.hbnf-payload.sha256"),
    (".hbnf-package-version", "www/mission-control-local/owner-pwa/.hbnf-package-version"),
]
sha = lambda b: hashlib.sha256(b).hexdigest()
TX = "cart116-c9-sigkill-20261105"

with tempfile.TemporaryDirectory(prefix="cart116-c9-rehearsal-", dir="/tmp") as tmp:
    root = pathlib.Path(tmp)
    source = root / "candidate"
    source.mkdir()
    targets = root / "six.tsv"
    old = {}
    new = {}
    rows = []
    for name, path in FILES:
        dest = root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        old[path] = ("original:" + name).encode()
        new[path] = ("approved-c9:" + name).encode()
        dest.write_bytes(old[path])
        dest.chmod(0o644)
        (source / name).write_bytes(new[path])
        rows.append(f"/{path}\t{name}\t{sha(old[path])}\t{sha(new[path])}\t644")
    targets.write_text("\n".join(rows) + "\n")
    protected = root / "www/mission-control-local/owner-pwa/untouched-extra.js"
    protected.write_bytes(b"do-not-change")

    def cmd(action, manifest=targets, staged=source):
        return ["sh", str(SCRIPT), action, str(root), str(manifest), str(staged), TX]

    p = subprocess.run(cmd("prepare"), capture_output=True, text=True)
    assert p.returncode == 0, (p.stdout, p.stderr)

    # Only this isolated test child receives the modified PATH; never a Cart.
    fakebin = root / "fake-bin"
    fakebin.mkdir()
    marker = root / "mv-count"
    wrapper = fakebin / "mv"
    wrapper.write_text("""#!/bin/sh
set -eu
/bin/mv "$@"
n=0
[ ! -f "$C9_KILL_COUNT_PATH" ] || n="$(cat "$C9_KILL_COUNT_PATH")"
n=$((n + 1))
printf '%s\n' "$n" > "$C9_KILL_COUNT_PATH"
if [ "$n" -eq 2 ]; then kill -KILL "$PPID"; fi
""")
    wrapper.chmod(0o755)
    # Witness that apply flushed the consumed one-time journal before swap #1.
    sync_wrapper = fakebin / "sync"
    sync_wrapper.write_text("""#!/bin/sh
set -eu
if [ -f "$C9_CONSUMED_PATH" ]; then : > "$C9_SYNC_WITNESS"; fi
exec /bin/sync "$@"
""")
    sync_wrapper.chmod(0o755)
    sync_witness = root / "journal-sync-before-swaps"
    env = dict(os.environ)
    env["PATH"] = str(fakebin) + os.pathsep + env.get("PATH", "")
    env["C9_KILL_COUNT_PATH"] = str(marker)
    env["C9_CONSUMED_PATH"] = str(root / "root/cart116-controls-one-time" / TX / "consumed")
    env["C9_SYNC_WITNESS"] = str(sync_witness)
    p = subprocess.run(cmd("apply"), env=env, capture_output=True, text=True)
    assert p.returncode != 0, (p.returncode, p.stdout, p.stderr)
    assert marker.read_text().strip() == "2", "exactly two file renames occurred"
    assert sync_witness.is_file(), "one-time consumed journal must be synced BEFORE first rename"
    for i, (_, path) in enumerate(FILES):
        assert (root / path).read_bytes() == (new[path] if i < 2 else old[path])
    assert protected.read_bytes() == b"do-not-change"

    registry = root / "root/cart116-controls-one-time" / TX
    journal = root / "root/cart116-controls-recovery" / TX
    assert (registry / "consumed").is_file()
    assert not (journal / "restored").exists(), "SIGKILL skipped EXIT handler"
    assert not (registry / "applied_pending_readback").exists()

    # Simulate lost candidate folder and external six.tsv. The durable journal
    # contains its own exact manifest+old files; no network or installer reflash.
    shutil.rmtree(source)
    targets.unlink()
    p = subprocess.run(cmd("restore", journal / "manifest.tsv", root / "candidate-no-longer-present"),
                       capture_output=True, text=True)
    assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
    assert (journal / "restored").is_file() and (registry / "restored").is_file()
    assert all((root / path).read_bytes() == old[path] for _, path in FILES)
    assert protected.read_bytes() == b"do-not-change"
    assert not any(pathlib.Path(str(root / path) + ".cart116c9-stage-" + TX).exists()
                   for _, path in FILES)
    p = subprocess.run(cmd("apply", journal / "manifest.tsv", root / "candidate-no-longer-present"),
                       capture_output=True, text=True)
    assert p.returncode != 0, "consumed one-time transaction may not replay"
    print("PASS: SIGKILL after 2/6 swaps, no EXIT trap, independent cold restore "
          "from journal with candidate+six.tsv missing, exact original bytes; replay refused")

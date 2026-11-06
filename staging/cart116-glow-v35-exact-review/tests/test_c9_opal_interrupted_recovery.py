"""C9 six-file source candidate: interruption after two renames auto-restores."""
import hashlib
import os
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
TX="cart116-c9-test-guarded-20261105"
sha=lambda b: hashlib.sha256(b).hexdigest()
with tempfile.TemporaryDirectory(prefix="cart116-c9-rehearsal-",dir="/tmp") as tmp:
    root=pathlib.Path(tmp)
    candidate=root/"candidate"
    candidate.mkdir()
    manifest=root/"six.tsv"
    rows=[]
    originals={}
    for name,path in NAMES:
        target=root/path
        target.parent.mkdir(parents=True,exist_ok=True)
        old=("known-good:"+name).encode()
        new=("six-file-reviewed:"+name).encode()
        target.write_bytes(old)
        target.chmod(0o644)
        (candidate/name).write_bytes(new)
        originals[path]=old
        rows.append(f"/{path}\t{name}\t{sha(old)}\t{sha(new)}\t644")
    manifest.write_text("\n".join(rows)+"\n")
    preserved=root/"www/mission-control-local/owner-pwa/stable-untouched.js"
    preserved.write_bytes(b"stable-unmodified")
    cmd=lambda action: ["sh",str(SCRIPT),action,str(root),str(manifest),str(candidate),TX]
    result=subprocess.run(cmd("prepare"),capture_output=True,text=True)
    assert result.returncode==0,(result.stdout,result.stderr)
    env=os.environ.copy()
    env["C9_SANDBOX_ABORT_AFTER"]="2"
    result=subprocess.run(cmd("apply"),env=env,capture_output=True,text=True)
    assert result.returncode==98,(result.returncode,result.stdout,result.stderr)
    assert all((root/path).read_bytes()==before for path,before in originals.items())
    assert preserved.read_bytes()==b"stable-unmodified"
    registry=root/"root/cart116-controls-one-time"/TX
    assert (registry/"consumed").is_file()
    assert not (registry/"applied_pending_readback").exists()
    recovery=root/"root/cart116-controls-recovery"/TX
    assert (recovery/"restored").is_file()
    for _,path in NAMES:
        assert not pathlib.Path(str(root/path)+".cart116c9-stage-"+TX).exists()
    replay=subprocess.run(cmd("apply"),capture_output=True,text=True)
    assert replay.returncode!=0
    rollback=subprocess.run(cmd("restore"),capture_output=True,text=True)
    assert rollback.returncode==0,(rollback.stdout,rollback.stderr)
    assert all((root/path).read_bytes()==before for path,before in originals.items())
    print("PASS: after 2/6 staged file renames: auto-rollback exact bytes, no residue, transaction burned; clean explicit recovery")

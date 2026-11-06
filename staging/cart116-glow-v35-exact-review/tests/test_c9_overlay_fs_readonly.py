"""C9 exact Opal GL-SFT1200 recovery mount observer: source-only tests."""
import pathlib
import subprocess
import tempfile

SCRIPT=pathlib.Path(__file__).resolve().parents[1]/"release/c9-opal-overlay-readonly.REVIEW_ONLY.sh"
with tempfile.TemporaryDirectory(dir="/tmp",prefix="cart116-c9-rehearsal-") as d:
    root=pathlib.Path(d)
    for parent in ("www","root","proc","tmp/sysinfo"):
        (root/parent).mkdir(parents=True,exist_ok=True)
    mounts=root/"proc/mounts"
    model=root/"tmp/sysinfo/model"
    def call(success):
        p=subprocess.run(["sh",str(SCRIPT),str(root)],capture_output=True,text=True)
        assert (p.returncode == 0) is success,(p.returncode,p.stdout,p.stderr)
        return p
    model.write_text("GL-SFT1200 (Opal)\n")
    mounts.write_text("overlayfs:/overlay / overlay rw 0 0\n"
                      "/dev/mtdblock6 /overlay jffs2 rw 0 0\n"
                      "tmpfs /tmp tmpfs rw 0 0\n")
    p=call(True)
    assert "C9_OVERLAY_FS_READ_ONLY_PASS" in p.stdout
    assert "NOT_POWER_CYCLE_TESTED" in p.stdout
    model.write_text("GL-A1300 (Slate Plus)\n")
    call(False)
    model.write_text("GL-SFT1200 (Opal)\n")
    mounts.write_text("tmpfs / tmpfs rw 0 0\n"
                      "/dev/mtdblock6 /overlay jffs2 rw 0 0\n")
    call(False)
    mounts.write_text("overlay / overlay rw 0 0\n"
                      "tmpfs /overlay tmpfs rw 0 0\n")
    call(False)
    mounts.write_text("overlay / overlay rw 0 0\n"
                      "/dev/mtdblock6 /overlay jffs2 rw 0 0\n")
    assert call(True).returncode==0
    # Authenticated Opal GL-SFT1200 2026-11-06: UBIFS persistent overlay.
    actual = ("/dev/ubi0_1 /overlay ubifs rw,noatime,ubi=0,vol=1 0 0\n"
              "overlayfs:/overlay / overlay rw,noatime,lowerdir=/,upperdir=/overlay/upper,workdir=/overlay/work 0 0\n")
    mounts.write_text(actual)
    assert call(True).returncode == 0
    mounts.write_text(actual + "tmpfs /root tmpfs rw 0 0\n")
    call(False)
    mounts.write_text(actual + "tmpfs /www/mission-control-local tmpfs rw 0 0\n")
    call(False)
    mounts.write_text(actual)
    assert call(True).returncode == 0
    model.unlink()
    call(False)
    model.write_text("GL-SFT1200 (Opal)\n")
    (root/"www").rmdir()
    (root/"www").symlink_to(root/"root")
    call(False)
    print("PASS: GL-SFT1200 overlay+jffs2 and same-FS read-only probe; wrong Slate Plus, tmpfs, missing model, symlink rejected")
p=subprocess.run(["sh",str(SCRIPT),"/"],capture_output=True,text=True)
assert p.returncode != 0, "unauthenticated ambient live-root probe must not pass"
print("PASS: no live-root access, device writes, or credential use in regression")

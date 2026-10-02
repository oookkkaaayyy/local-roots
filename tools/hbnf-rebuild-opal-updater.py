#!/usr/bin/env python3
"""Rebuild the known HBNF Opal updater IPK with OpenWrt-18.06 fixes.

Source-only tool. It never talks to the router and never installs anything.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import os
from pathlib import Path
import re
import shutil
import stat
import tarfile
import tempfile

KNOWN_BASE_SHA256 = "090300853504e3e2bc6fe50c64cbb2b87c6688e38af9dc51dfcada2d87fbcdff"
NEW_VERSION = "1.2.4-1"

CONTROLLER = Path("usr/lib/lua/luci/controller/hbnf_updater.lua")
UPDATER = Path("usr/libexec/hbnf-updater")
CONFIG = Path("etc/hbnf-updater/config")
STAT_HELPER = Path("usr/libexec/hbnf-compat/stat")

STAT_HELPER_TEXT = r'''#!/bin/sh
set -eu
[ "${1:-}" = "-c" ] || { echo "hbnf stat: only -c is supported" >&2; exit 2; }
fmt="${2:-}"
path="${3:-}"
[ -n "$path" ] || { echo "hbnf stat: path required" >&2; exit 2; }
case "$fmt" in
  %s) wc -c < "$path" | tr -d '[:space:]' ;;
  %u) ls -ldn "$path" | awk '{print $3}' ;;
  %a)
    perms="$(ls -ld "$path" | awk '{print $1}')"
    [ "${#perms}" -ge 10 ] || exit 1
    triplet_to_num() {
      t="$1"; n=0
      [ "$(printf '%s' "$t" | cut -c1)" = "r" ] && n=$((n+4))
      [ "$(printf '%s' "$t" | cut -c2)" = "w" ] && n=$((n+2))
      x="$(printf '%s' "$t" | cut -c3)"
      [ "$x" = "x" ] || [ "$x" = "s" ] || [ "$x" = "t" ] || { printf '%s' "$n"; return; }
      n=$((n+1)); printf '%s' "$n"
    }
    u="$(triplet_to_num "$(printf '%s' "$perms" | cut -c2-4)")"
    g="$(triplet_to_num "$(printf '%s' "$perms" | cut -c5-7)")"
    o="$(triplet_to_num "$(printf '%s' "$perms" | cut -c8-10)")"
    printf '%s%s%s\n' "$u" "$g" "$o"
    ;;
  *) echo "hbnf stat: unsupported format $fmt" >&2; exit 2 ;;
esac
'''

ORIGIN_OLD = '''local expected_origin=(action=="challenge" or action=="install" or action=="result") and opal_origin or matrix_origin
	if action=="check" then
		if origin~=matrix_origin and origin~=opal_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
		expected_origin=origin
	end
	if origin~=expected_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end'''

ORIGIN_NEW = '''if action=="challenge" or action=="install" then
		if origin~=opal_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
	elseif action=="check" then
		if origin and origin~=matrix_origin and origin~=opal_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
	elseif action=="result" then
		if origin~=matrix_origin and origin~=opal_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
	else
		if origin~=matrix_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
	end'''

RESULT_OLD = '''if action == "result" then
		local body=fs.readfile("/tmp/hbnf-updater/job.json")
		local value=body and require("luci.jsonc").parse(body) or {state="idle"}
		if value and value.state=="complete" then value.health_result=fs.readfile("/tmp/hbnf-updater/install-health.json") or "" end
		return json_reply(200,value or {state="unknown"})
	end'''

RESULT_NEW = '''if action == "result" then
		if origin == matrix_origin then
			http.header("Access-Control-Allow-Origin", matrix_origin)
			http.header("Vary", "Origin")
		end
		local body=fs.readfile("/tmp/hbnf-updater/job.json")
		local value=body and require("luci.jsonc").parse(body) or {state="idle"}
		if value and value.state=="complete" then value.health_result=fs.readfile("/tmp/hbnf-updater/install-health.json") or "" end
		return json_reply(200,value or {state="unknown"})
	end'''


def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_extract(tf: tarfile.TarFile, dest: Path) -> None:
    base=dest.resolve()
    for member in tf.getmembers():
        target=(dest/member.name).resolve()
        if target != base and base not in target.parents:
            raise RuntimeError("unsafe tar member: "+member.name)
    tf.extractall(dest)


def extract_targz(path: Path, dest: Path) -> None:
    with tarfile.open(path, "r:gz") as tf:
        safe_extract(tf,dest)


def write_deterministic_targz(root: Path, out: Path) -> None:
    with out.open("wb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as gz:
            with tarfile.open(fileobj=gz,mode="w",format=tarfile.GNU_FORMAT) as tf:
                items=sorted([p for p in root.rglob("*")], key=lambda p:(len(p.relative_to(root).parts), str(p.relative_to(root))))
                for p in items:
                    arc="./"+str(p.relative_to(root))
                    info=tf.gettarinfo(str(p),arcname=arc)
                    info.mtime=0
                    if p.is_file() and not p.is_symlink():
                        with p.open("rb") as src: tf.addfile(info,src)
                    else:
                        tf.addfile(info)


def patch_controller(path: Path) -> dict[str,int]:
    text=path.read_text()
    counts={}
    def sub(pattern,repl,name,flags=0,min_count=1):
        nonlocal text
        text,n=re.subn(pattern,repl,text,flags=flags)
        counts[name]=n
        if n<min_count:
            raise RuntimeError("controller patch did not match: "+name)
    sub(r'fs\.mkdir\(([^,\n]+),\s*448\)',r'fs.mkdir(\1)',"mkdir_mode")
    sub(r'fs\.chmod\(([^,\n]+),\s*448\)',r'fs.chmod(\1, "0700")',"chmod_0700")
    sub(r'fs\.chmod\(([^,\n]+),\s*384\)',r'fs.chmod(\1, "0600")',"chmod_0600")
    sub(r'fs\.chmod\(([^,\n]+),\s*420\)',r'fs.chmod(\1, "0644")',"chmod_0644")
    sub(r'nixio\.umask\(63\)',r'nixio.umask("0077")',"umask")
    if ORIGIN_OLD not in text:
        raise RuntimeError("controller origin block did not match known 1.2.3 source")
    text=text.replace(ORIGIN_OLD,ORIGIN_NEW,1); counts["origin_block"]=1
    if RESULT_OLD not in text:
        raise RuntimeError("controller result block did not match known 1.2.3 source")
    text=text.replace(RESULT_OLD,RESULT_NEW,1); counts["result_cors"]=1
    path.write_text(text)
    return counts


def patch_updater(path: Path) -> dict[str,int]:
    text=path.read_text()
    if not text.startswith("#!/bin/sh"):
        raise RuntimeError("unexpected updater shebang")
    marker='PATH="/usr/libexec/hbnf-compat:$PATH"\nexport PATH\n'
    if marker not in text:
        text=text.replace("#!/bin/sh\n","#!/bin/sh\n"+marker,1)
    mac_count=text.count("tr -d ':-.'")
    if mac_count<1:
        raise RuntimeError("BusyBox-unsafe MAC normalization pattern not found")
    text=text.replace("tr -d ':-.'","tr -d ':' | tr -d '-' | tr -d '.'")
    path.write_text(text)
    return {"compat_path":1,"mac_normalize":mac_count}


def patch_control(control_root: Path) -> None:
    control=control_root/"control"
    text=control.read_text()
    text,n=re.subn(r'^Version:\s*.*$',"Version: "+NEW_VERSION,text,count=1,flags=re.M)
    if n!=1: raise RuntimeError("control Version line missing")
    control.write_text(text)
    conffiles=control_root/"conffiles"
    existing=[]
    if conffiles.exists():
        existing=[x.strip() for x in conffiles.read_text().splitlines() if x.strip()]
    item="/etc/hbnf-updater/config"
    if item not in existing: existing.append(item)
    conffiles.write_text("\n".join(existing)+"\n")


def verify_patched(data_root: Path, control_root: Path) -> None:
    controller=(data_root/CONTROLLER).read_text()
    updater=(data_root/UPDATER).read_text()
    required=[
        'fs.chmod(dir, "0700")',
        'nixio.umask("0077")',
        'if action=="challenge" or action=="install" then',
        'elseif action=="result" then',
        'Access-Control-Allow-Origin", matrix_origin',
    ]
    for needle in required:
        if needle not in controller: raise RuntimeError("verification missing: "+needle)
    forbidden=["nixio.umask(63)","tr -d ':-.'"]
    for needle in forbidden:
        if needle in controller or needle in updater: raise RuntimeError("verification forbidden pattern remains: "+needle)
    if 'PATH="/usr/libexec/hbnf-compat:$PATH"' not in updater:
        raise RuntimeError("compat PATH missing")
    helper=data_root/STAT_HELPER
    if not helper.is_file() or not os.access(helper,os.X_OK):
        raise RuntimeError("compat stat helper missing/not executable")
    if not (data_root/Path("usr/lib/lua/luci/view/hbnf-updater")).is_dir(): raise RuntimeError("view parent dir missing")
    if not (data_root/Path("www/luci-static/resources/hbnf")).is_dir(): raise RuntimeError("resource parent dir missing")
    if not (data_root/Path("etc/hbnf-updater")).is_dir(): raise RuntimeError("config parent dir missing")
    if ("Version: "+NEW_VERSION) not in (control_root/"control").read_text(): raise RuntimeError("new version missing")
    if "/etc/hbnf-updater/config" not in (control_root/"conffiles").read_text(): raise RuntimeError("config conffile missing")


def build_outer(debian: Path, data_tgz: Path, control_tgz: Path, out: Path) -> None:
    with out.open("wb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as gz:
            with tarfile.open(fileobj=gz,mode="w",format=tarfile.GNU_FORMAT) as tf:
                for path,name in [(debian,"./debian-binary"),(data_tgz,"./data.tar.gz"),(control_tgz,"./control.tar.gz")]:
                    info=tf.gettarinfo(str(path),arcname=name)
                    info.mtime=0
                    with path.open("rb") as src: tf.addfile(info,src)


def rebuild_ipk(source: Path, output: Path, expected_sha: str) -> dict:
    actual=sha256(source)
    if expected_sha and actual.lower()!=expected_sha.lower():
        raise RuntimeError("base IPK SHA mismatch: "+actual)
    with tempfile.TemporaryDirectory(prefix="hbnf-updater-rebuild-") as td:
        root=Path(td)
        outer=root/"outer"; data=root/"data"; control=root/"control"
        outer.mkdir(); data.mkdir(); control.mkdir()
        with tarfile.open(source,"r:gz") as tf: safe_extract(tf,outer)
        db=outer/"debian-binary"; dt=outer/"data.tar.gz"; ct=outer/"control.tar.gz"
        if not (db.is_file() and dt.is_file() and ct.is_file()): raise RuntimeError("unexpected IPK outer members")
        if db.read_text().strip()!="2.0": raise RuntimeError("unsupported debian-binary marker")
        extract_targz(dt,data); extract_targz(ct,control)

        for d in [
            data/"usr/lib/lua/luci/view/hbnf-updater",
            data/"www/luci-static/resources/hbnf",
            data/"etc/hbnf-updater",
            data/"usr/libexec/hbnf-compat",
        ]: d.mkdir(parents=True,exist_ok=True)

        controller_counts=patch_controller(data/CONTROLLER)
        updater_counts=patch_updater(data/UPDATER)
        helper=data/STAT_HELPER
        helper.write_text(STAT_HELPER_TEXT)
        helper.chmod(0o755)
        (data/UPDATER).chmod(0o755)
        patch_control(control)
        verify_patched(data,control)

        data_new=root/"data.new.tar.gz"; control_new=root/"control.new.tar.gz"
        write_deterministic_targz(data,data_new)
        write_deterministic_targz(control,control_new)
        output.parent.mkdir(parents=True,exist_ok=True)
        build_outer(db,data_new,control_new,output)

    return {
        "base_sha256":actual,
        "output_sha256":sha256(output),
        "version":NEW_VERSION,
        "controller_patches":controller_counts,
        "updater_patches":updater_counts,
    }


def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument("source_ipk",type=Path)
    ap.add_argument("output_ipk",type=Path)
    ap.add_argument("--expected-sha",default=KNOWN_BASE_SHA256)
    args=ap.parse_args()
    result=rebuild_ipk(args.source_ipk,args.output_ipk,args.expected_sha)
    for k,v in result.items(): print(k+"="+str(v))


if __name__=="__main__":
    main()

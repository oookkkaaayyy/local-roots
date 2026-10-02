#!/usr/bin/env python3
import gzip,hashlib,io,os,pathlib,subprocess,tarfile,tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
TOOL=ROOT/"tools/hbnf-rebuild-opal-updater.py"

CONTROLLER='''module("luci.controller.hbnf_updater", package.seeall)
local OPAL_ORIGIN = "https://console.gl-inet.com"
local OPAL_HOST = "console.gl-inet.com"
local function json_reply(status,value) end
local function rate_limited_check()
  local fs=require "nixio.fs"
  local lock="/tmp/hbnf-updater/check.lock"
  fs.mkdir("/tmp/hbnf-updater", 448)
  fs.chmod("/tmp/hbnf-updater", 448)
  if not fs.mkdir(lock, 448) then return true end
end
function save_pin()
  local fs=require "nixio.fs"; local nixio=require "nixio"
  local dir="/etc/hbnf-updater"; fs.mkdir(dir,448); fs.chmod(dir,448)
  local oldmask=nixio.umask(63); local path=dir.."/wled-pin"; fs.chmod(path,384)
end
function save_release_key()
  local fs=require "nixio.fs"; local pending="/tmp/pending"; fs.chmod(pending,384); fs.chmod(pending,420)
end
function public_api()
  local http=require "luci.http"; local fs=require "nixio.fs"
  local origin=http.getenv("HTTP_ORIGIN")
  local matrix_origin="http://192.168.77.10"
  local opal_origin=OPAL_ORIGIN
  local action=http.formvalue("action")
  local method=http.getenv("REQUEST_METHOD")
  local expected_origin=(action=="challenge" or action=="install" or action=="result") and opal_origin or matrix_origin
  if action=="check" then
    if origin~=matrix_origin and origin~=opal_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
    expected_origin=origin
  end
  if origin~=expected_origin then return json_reply(403,{ok=false,error="origin-not-allowed"}) end
  if http.getenv("HTTP_HOST")~=OPAL_HOST then return json_reply(403,{ok=false,error="opal-https-host-required"}) end
  if action=="challenge" and method=="POST" then
    fs.mkdir("/tmp/hbnf-updater",448); fs.chmod("/tmp/hbnf-updater",448)
  end
  if action=="install" and method=="POST" then
    local dir="/tmp/hbnf-updater"; fs.mkdir(dir,448); fs.chmod(dir,448)
  end
  if method ~= "GET" then return json_reply(405,{ok=false,error="method-not-allowed"}) end
  if action == "result" then
    local body=fs.readfile("/tmp/hbnf-updater/job.json")
    local value=body and require("luci.jsonc").parse(body) or {state="idle"}
    if value and value.state=="complete" then value.health_result=fs.readfile("/tmp/hbnf-updater/install-health.json") or "" end
    return json_reply(200,value or {state="unknown"})
  end
end
'''

UPDATER='''#!/bin/sh
set -eu
normalize_mac() { printf '%s' "$1" | tr -d ':-.' | tr 'A-F' 'a-f'; }
require_tools() { for x in curl jsonfilter openssl stat; do command -v "$x" >/dev/null; done; }
x="$(stat -c %s /tmp/a)"
'''

CONTROL='''Package: luci-app-hbnf-updater
Version: 1.2.2-1
Architecture: all
Description: test
'''

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def targz_from(root,out):
    with out.open("wb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as gz:
            with tarfile.open(fileobj=gz,mode="w",format=tarfile.GNU_FORMAT) as tf:
                for p in sorted(root.rglob("*"),key=lambda p:str(p.relative_to(root))):
                    arc="./"+str(p.relative_to(root))
                    info=tf.gettarinfo(str(p),arcname=arc); info.mtime=0
                    if p.is_file():
                        with p.open("rb") as f: tf.addfile(info,f)
                    else: tf.addfile(info)

def outer(db,data,control,out):
    with out.open("wb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0) as gz:
            with tarfile.open(fileobj=gz,mode="w",format=tarfile.GNU_FORMAT) as tf:
                for p,n in [(db,"./debian-binary"),(data,"./data.tar.gz"),(control,"./control.tar.gz")]:
                    info=tf.gettarinfo(str(p),arcname=n); info.mtime=0
                    with p.open("rb") as f: tf.addfile(info,f)

def extract(path,dest):
    with tarfile.open(path,"r:gz") as tf: tf.extractall(dest)

with tempfile.TemporaryDirectory() as td:
    t=pathlib.Path(td)
    data=t/"data"; ctl=t/"control"; data.mkdir(); ctl.mkdir()
    (data/"usr/lib/lua/luci/controller").mkdir(parents=True)
    (data/"usr/lib/lua/luci/view/hbnf-updater").mkdir(parents=True)
    (data/"www/luci-static/resources/hbnf").mkdir(parents=True)
    (data/"etc/hbnf-updater").mkdir(parents=True)
    (data/"usr/libexec").mkdir(parents=True)
    (data/"usr/lib/lua/luci/controller/hbnf_updater.lua").write_text(CONTROLLER)
    up=data/"usr/libexec/hbnf-updater"; up.write_text(UPDATER); up.chmod(0o755)
    (data/"usr/lib/lua/luci/view/hbnf-updater/index.htm").write_text("x")
    (data/"usr/lib/lua/luci/view/hbnf-updater/installer.htm").write_text("x")
    (data/"www/luci-static/resources/hbnf/trusted_ipad_auth.js").write_text("x")
    (data/"etc/hbnf-updater/config").write_text("MATRIX_IP='192.168.77.10'\n")
    (ctl/"control").write_text(CONTROL)
    db=t/"debian-binary"; db.write_text("2.0\n")
    dt=t/"data.tar.gz"; ct=t/"control.tar.gz"; targz_from(data,dt); targz_from(ctl,ct)
    base=t/"base.ipk"; outer(db,dt,ct,base)
    out=t/"new.ipk"
    subprocess.run(["python3",str(TOOL),str(base),str(out),"--expected-sha",sha(base)],check=True)

    outx=t/"out"; outx.mkdir(); extract(out,outx)
    assert [m.name for m in tarfile.open(out,"r:gz").getmembers()] == ["./debian-binary","./data.tar.gz","./control.tar.gz"]
    dx=t/"dx"; cx=t/"cx"; dx.mkdir(); cx.mkdir(); extract(outx/"data.tar.gz",dx); extract(outx/"control.tar.gz",cx)

    controller=(dx/"usr/lib/lua/luci/controller/hbnf_updater.lua").read_text()
    updater=(dx/"usr/libexec/hbnf-updater").read_text()
    assert 'nixio.umask("0077")' in controller
    assert 'fs.chmod(dir, "0700")' in controller
    assert 'if action=="challenge" or action=="install" then' in controller
    assert 'elseif action=="result" then' in controller
    assert 'Access-Control-Allow-Origin", matrix_origin' in controller
    assert "tr -d ':-.'" not in updater
    assert "tr -d ':' | tr -d '-' | tr -d '.'" in updater
    assert 'PATH="/usr/libexec/hbnf-compat:$PATH"' in updater
    helper=dx/"usr/libexec/hbnf-compat/stat"
    assert helper.exists() and os.access(helper,os.X_OK)
    assert subprocess.check_output([str(helper),"-c","%s",str(helper)],text=True).strip().isdigit()
    assert subprocess.check_output([str(helper),"-c","%u",str(helper)],text=True).strip().isdigit()
    assert subprocess.check_output([str(helper),"-c","%a",str(helper)],text=True).strip()=="755"
    assert "Version: 1.2.4-1" in (cx/"control").read_text()
    assert "/etc/hbnf-updater/config" in (cx/"conffiles").read_text()

print("HBNF_OPAL_REBUILDER_TEST=PASS")

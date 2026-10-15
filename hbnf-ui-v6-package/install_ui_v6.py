#!/usr/bin/env python3
import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys, time, urllib.error, urllib.request

ROOT=pathlib.Path(__file__).resolve().parent
CONTROLLER=ROOT/"controller"
MANIFEST_PATH=ROOT/"MANIFEST.json"
LIVE_URL="https://hbnightflyers.com/hbnf-cart.html"
BUILD_MARKER="hbnf-cart2-owner-control-local-v1-20261015"
RELEASE_LABEL="HBNF CART 2.0 OWNER CONTROL LOCAL V1"
FILES=[
    "hbnf-cart.html",
    "hbnf-cart.js",
    "hbnf-cart-local.mjs",
    "hbnf-cart-net.mjs",
    "hbnf-cart-sw.js",
    "hbnf-cart-semantic.mjs",
    "hbnf-cart-manifest.webmanifest",
    "hbnf-cart-ui-v6.css",
    "hbnf-cart-ui-v6.mjs",
    "hbnf-cart-features.mjs",
    "hbnf-cart-skins-score.mjs",
    "hbnf-cart-icon-180.png",
    "hbnf-cart-icon-192.png",
    "hbnf-cart-icon-512.png",
]
GUEST_FILES=[
    "guest/hbnf-cart/index.html",
    "guest/hbnf-cart/guest.js",
    "guest/hbnf-cart/guest.css",
]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def check_package():
    if not MANIFEST_PATH.is_file(): raise RuntimeError("MANIFEST.json missing")
    manifest=json.loads(MANIFEST_PATH.read_text())
    marker=manifest.get("buildMarker")
    if marker!=BUILD_MARKER: raise RuntimeError("Package build marker mismatch")
    for name in FILES+GUEST_FILES:
        path=CONTROLLER/name
        expected=manifest.get("files",{}).get(name)
        if not path.is_file() or not expected or sha256(path)!=expected:
            raise RuntimeError("Package integrity failed: "+name)
    html=(CONTROLLER/"hbnf-cart.html").read_text(errors="replace")
    if BUILD_MARKER not in html:
        raise RuntimeError("Controller identity mismatch")
    if manifest.get("sourceCommit") != (ROOT/"SOURCE_COMMIT.txt").read_text().strip():
        raise RuntimeError("Package source commit mismatch")
    for name in ("install_ui_v6.py", "INSTALL_UI_V6.command", "SOURCE_COMMIT.txt"):
        expected=manifest.get("packageFiles",{}).get(name)
        if not expected or sha256(ROOT/name)!=expected:
            raise RuntimeError("Package metadata integrity failed: "+name)
    guest=(CONTROLLER/"guest/hbnf-cart/index.html").read_text(errors="replace")
    if "HBNF Cart Guest" not in guest or "/functions/v1/hbnf-cart-control" not in (CONTROLLER/"guest/hbnf-cart/guest.js").read_text(errors="replace"):
        raise RuntimeError("Guest route identity or Cart command contract mismatch")

def worker_candidates():
    home=pathlib.Path.home()
    seeds=[
        home/"Desktop/01 ACTIVE PROJECTS/HBNF-Website-Deploy/hbnf-static-worker",
        home/"Desktop/HBNF-Website-Deploy/hbnf-static-worker",
    ]
    out=[]
    for p in seeds:
        if p.is_dir(): out.append(p)
    desktop=home/"Desktop"
    if desktop.is_dir():
        for p in desktop.rglob("hbnf-static-worker"):
            if p.is_dir() and len(p.parts)<=len(desktop.parts)+6: out.append(p)
    unique=[]
    for p in out:
        rp=p.resolve()
        if rp not in unique and (rp/"public").is_dir() and any((rp/n).exists() for n in ["wrangler.toml","wrangler.json","wrangler.jsonc","package.json"]):
            unique.append(rp)
    return unique

def find_worker():
    found=worker_candidates()
    if len(found)!=1:
        raise RuntimeError("Expected exactly one HBNF Cloudflare worker source; found "+str(len(found)))
    return found[0]

def resolve_wrangler(worker):
    local=worker/"node_modules/.bin/wrangler"
    if local.is_file(): return [str(local)]
    direct=shutil.which("wrangler")
    if direct: return [direct]
    npx=shutil.which("npx")
    if npx: return [npx,"--yes","wrangler"]
    raise RuntimeError("Wrangler not available")

def live_marker():
    req=urllib.request.Request(
        LIVE_URL+"?release="+BUILD_MARKER+"&ts="+str(int(time.time())),
        headers={
            "User-Agent":"Mozilla/5.0",
            "Accept":"text/html,application/xhtml+xml",
            "Cache-Control":"no-cache",
        },
    )
    try:
        with urllib.request.urlopen(req,timeout=15) as r:
            body=r.read().decode("utf-8","replace")
            return r.status, BUILD_MARKER in body
    except urllib.error.HTTPError as e:
        return e.code, False
    except Exception:
        return 0, False

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--validate-only",action="store_true",help="Validate the extracted package without deployment or network access")
    args=parser.parse_args()
    print(RELEASE_LABEL+" — static package")
    print("No Matrix/AUX firmware or Phase 2 game/router changes.")
    check_package()
    if args.validate_only:
        print("HBNF_CART2_PACKAGE_VALIDATION=PASS")
        return
    worker=find_worker()
    stamp=time.strftime("%Y%m%d-%H%M%S")
    backup=pathlib.Path.home()/("HBNF_CART_UI_BACKUP_"+stamp)
    backup.mkdir(parents=True,exist_ok=False)
    public=worker/"public"
    for name in FILES+GUEST_FILES:
        src=public/name
        if src.exists():
            (backup/name).parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(src,backup/name)
    for name in FILES+GUEST_FILES:
        (public/name).parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(CONTROLLER/name,public/name)
    wrangler=resolve_wrangler(worker)
    print("Deploying controller with Wrangler...")
    subprocess.run(wrangler+["deploy"],cwd=worker,check=True)
    verified=False
    last_status=0
    for _ in range(8):
        last_status,verified=live_marker()
        if verified: break
        time.sleep(3)
    if not verified:
        raise RuntimeError("Deploy finished but exact Cart 2.0 marker did not verify (HTTP "+str(last_status)+")")
    print("HBNF_CART2_OWNER_GUEST_INSTALL=PASS")
    print("BACKUP="+str(backup))
    print("LIVE_MARKER=PASS")
    subprocess.run(["/usr/bin/open",LIVE_URL],check=False)

if __name__=="__main__":
    try:
        main()
    except Exception as e:
        print("HBNF_CART2_OWNER_GUEST_INSTALL=FAIL")
        print(str(e))
        sys.exit(1)

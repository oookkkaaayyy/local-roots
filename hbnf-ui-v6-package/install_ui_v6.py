#!/usr/bin/env python3
import hashlib, json, os, pathlib, shutil, subprocess, sys, time, urllib.error, urllib.request

ROOT=pathlib.Path(__file__).resolve().parent
CONTROLLER=ROOT/"controller"
MANIFEST_PATH=ROOT/"MANIFEST.json"
LIVE_URL="https://hbnightflyers.com/hbnf-cart.html"
BUILD_MARKER="hbnf-cart-final-v6-observable"
FILES=[
    "hbnf-cart.html",
    "hbnf-cart.js",
    "hbnf-cart-semantic.mjs",
    "hbnf-cart-manifest.webmanifest",
    "hbnf-cart-ui-v6.css",
    "hbnf-cart-ui-v6.mjs",
]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def check_package():
    if not MANIFEST_PATH.is_file(): raise RuntimeError("MANIFEST.json missing")
    manifest=json.loads(MANIFEST_PATH.read_text())
    if manifest.get("buildMarker")!=BUILD_MARKER: raise RuntimeError("Package build marker mismatch")
    for name in FILES:
        path=CONTROLLER/name
        expected=manifest.get("files",{}).get(name)
        if not path.is_file() or not expected or sha256(path)!=expected:
            raise RuntimeError("Package integrity failed: "+name)
    html=(CONTROLLER/"hbnf-cart.html").read_text(errors="replace")
    js=(CONTROLLER/"hbnf-cart-ui-v6.mjs").read_text(errors="replace")
    if BUILD_MARKER not in html or "HBNF_CART_UI_V6_OBSERVABLE" not in js:
        raise RuntimeError("Controller identity mismatch")

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
        LIVE_URL+"?release=HBNF_CART_UI_V6_20260927&ts="+str(int(time.time())),
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
    print("HBNF CART UI V6 — controller-only installer")
    print("No Matrix/AUX firmware or Phase 2 game/router changes.")
    check_package()
    worker=find_worker()
    stamp=time.strftime("%Y%m%d-%H%M%S")
    backup=pathlib.Path.home()/("HBNF_CART_UI_BACKUP_"+stamp)
    backup.mkdir(parents=True,exist_ok=False)
    public=worker/"public"
    for name in FILES:
        src=public/name
        if src.exists():
            (backup/name).parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(src,backup/name)
    for name in FILES:
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
    if not verified and last_status not in (401,403):
        raise RuntimeError("Deploy finished but exact live V6 marker did not verify")
    print("HBNF_CART_UI_V6_INSTALL=PASS")
    print("BACKUP="+str(backup))
    if verified: print("LIVE_MARKER=PASS")
    else: print("LIVE_MARKER=BLOCKED_HTTP_"+str(last_status)+" (Wrangler deploy succeeded)")
    subprocess.run(["/usr/bin/open",LIVE_URL],check=False)

if __name__=="__main__":
    try:
        main()
    except Exception as e:
        print("HBNF_CART_UI_V6_INSTALL=FAIL")
        print(str(e))
        sys.exit(1)

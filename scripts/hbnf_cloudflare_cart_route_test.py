#!/usr/bin/env python3
import argparse,datetime,hashlib,json,pathlib,re,subprocess,zipfile,tempfile,os
R=pathlib.Path(__file__).resolve().parents[1]
D=R/"evidence/cart2-dedicated-worker-stage-20261010/corrected-route-test"
S=json.loads((R/"evidence/cart2-dedicated-worker-stage-20261010/stage-spec.json").read_text())
W=(R/"evidence/cart2-dedicated-worker-stage-20261010/worker.mjs").read_bytes()
P=R/"evidence/cart2-owner-guest-vibe-r2-20261009/HBNF_CART_OWNER_GUEST_CART2_VIBE_R2_20261009.zip"
H="https://hbnightflyers.com"; N="cart2-r2-20261010-corrected"
BASE=[("/", "GET"),("/favicon.ico","GET"),("/manifest.webmanifest","GET"),("/hbnf-cart.html","GET"),("/hbnf-cart-not-a-file","GET"),("/hbnf-cart.html/child","GET"),("/guest/hbnf-cart/unknown","GET"),("/firmware/matrix/stable/latest.json","GET"),("/firmware/matrix/stable/latest.json.sig","GET"),("/firmware/opal-updater/1.2.3/luci-app-hbnf-updater_1.2.3-1_all-090300853504e3e2bc6fe50c64cbb2b87c6688e38af9dc51dfcada2d87fbcdff.ipk","HEAD")]
sha=lambda b:hashlib.sha256(b).hexdigest()
def strip_jsd(body):
 blocks=list(re.finditer(rb"<script\b[^>]*>[\s\S]*?</script\s*>",body,re.I))
 jsd=[m for m in blocks if b"window.__CF$cv$params" in m.group(0) and b"/cdn-cgi/challenge-platform/scripts/jsd/main.js" in m.group(0)]
 if not jsd: return body,None
 if len(jsd)!=1: raise RuntimeError("multiple Cloudflare JSD scripts")
 m=jsd[0]
 return body[:m.start()]+body[m.end():],m.group(0)
def get(path,phase,i,method="GET"):
 d=D/phase; d.mkdir(parents=True,exist_ok=True)
 name=f"{i:02d}_"+(re.sub(r"[^A-Za-z0-9]+","_",path).strip("_") or "root")
 bp=d/(name+".body"); fd,hname=tempfile.mkstemp(prefix="cart2_route_headers_"); os.close(fd); hp=pathlib.Path(hname)
 url=H+path
 if phase in ("candidate-assets","candidate-fallback"): url+=("?__cart2_route_check="+N+"_"+str(i))
 cmd=["/usr/bin/curl","--silent","--show-error","--max-time","12","--connect-timeout","5","-H","Cache-Control: no-cache","-H","Pragma: no-cache","-D",str(hp),"-o",str(bp),"-w","%{http_code}\n%{size_download}\n%{url_effective}\n"]
 if method=="HEAD": cmd.append("--head")
 cmd.append(url); p=subprocess.run(cmd,capture_output=True,text=True)
 if p.returncode: raise RuntimeError(f"curl error {p.returncode}: {p.stderr}")
 lines=p.stdout.splitlines(); status=int(lines[0]); size=int(float(lines[1]))
 body=bp.read_bytes() if method!="HEAD" else b""
 if method=="HEAD": bp.unlink(missing_ok=True)
 if method!="HEAD" and size!=len(body): raise RuntimeError("curl/body length mismatch "+path)
 hb=hp.read_text(errors="replace"); block=re.split(r"\r?\n\r?\n",hb.strip())[-1]; hdr={}
 hp.unlink(missing_ok=True)
 for ln in block.splitlines()[1:]:
  if ":" in ln: k,v=ln.split(":",1); hdr[k.strip().lower()]=v.strip()
 return {"path":path,"method":method,"status":status,"bytes":len(body),"sha256":sha(body),"headers":hdr,"body_path":str(bp.relative_to(R)) if method!="HEAD" else None},body
def main():
 a=argparse.ArgumentParser(); a.add_argument("phase",choices=["baseline","candidate-assets","candidate-fallback"]); phase=a.parse_args().phase
 if sha(P.read_bytes())!=S["approved_package_sha256"]: raise SystemExit("approved ZIP hash mismatch")
 if sha(W)!=S["worker_module_sha256"]: raise SystemExit("Worker source hash mismatch")
 files=json.loads(W.decode().splitlines()[0][len("const FILES = "):-1]); files["/hbnf-cart"]=files["/hbnf-cart.html"]
 res={"schema":"hbnf-cart2-corrected-route-validation-v1","phase":phase,"captured_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"client":{"tool":"/usr/bin/curl","version":subprocess.run(["/usr/bin/curl","--version"],capture_output=True,text=True).stdout.splitlines()[0],"user_agent":"curl default; not spoofed"},"approved_zip_sha256":sha(P.read_bytes()),"worker_source_sha256":sha(W),"worker_version_id":S["worker_version_id"],"results":[]}
 if phase=="baseline":
  for i,(p,m) in enumerate(BASE,1): res["results"].append(get(p,phase,i,m)[0])
  out=D/"baseline.json"
 elif phase=="candidate-assets":
  with zipfile.ZipFile(P) as z:
   names=set(z.namelist()); package_prefix=next((n.split("/",1)[0]+"/controller/" for n in z.namelist() if n.endswith("/controller/hbnf-cart.html")),"")
   if not package_prefix: raise RuntimeError("approved package controller root missing")
   for i,path in enumerate(S["url_paths"],1):
    f=files[path]; package_path=f["package_path"]
    if package_path not in names: package_path=package_prefix+package_path
    if package_path not in names: raise RuntimeError("approved package mapping missing: "+package_path)
    r,b=get(path,phase,i); exp=z.read(package_path); jsd=None; canonical=b
    marks=[b.count(b"window.__CF$cv$params"),b.count(b"/cdn-cgi/challenge-platform/scripts/jsd/main.js")]
    if marks==[1,1]:
     pos=b.find(b"window.__CF$cv$params"); start=b.rfind(b"<script",0,pos); end=b.find(b"</script>",pos)
     if start<0 or end<0: raise RuntimeError("JSD tag boundary missing "+path)
     end+=len(b"</script>"); jsd=b[start:end]; canonical=b[:start]+b[end:]
     name=(path.strip("/").replace("/","_") or "root")
     (D/phase/(name+".jsd.bin")).write_bytes(jsd); (D/phase/(name+".canonical.bin")).write_bytes(canonical)
     if canonical!=exp: raise RuntimeError("JSD removal failed exact source byte comparison "+path)
    elif marks!=[0,0] or b!=exp: raise RuntimeError("unrecognized HTML transformation or byte mismatch "+path)
    hdr=r["headers"]; media=hdr.get("content-type","").split(";",1)[0].lower()
    if r["status"]!=200: raise RuntimeError(f"status {r['status']} for {path}")
    if media!=f["mime"].split(";",1)[0].lower(): raise RuntimeError("MIME mismatch "+path)
    if hdr.get("cache-control")!=f["cache_control"]: raise RuntimeError("cache mismatch "+path)
    if hdr.get("x-hbnf-candidate")!="cart2-owner-guest-r2-canonical-20261010": raise RuntimeError("marker mismatch "+path)
    if jsd:
     if hdr.get("etag") is not None or len(b)-len(exp)!=len(jsd): raise RuntimeError("unaccounted JSD/ETag bytes "+path)
    elif hdr.get("etag")!=f["etag"]: raise RuntimeError("ETag mismatch "+path)
    r.update({"package_path":f["package_path"],"expected_bytes":len(exp),"expected_sha256":sha(exp),"canonical_source_exact":canonical==exp,"edge_jsd_bytes":len(jsd or b""),"edge_jsd_sha256":sha(jsd) if jsd else None,"edge_delta_bytes":len(b)-len(exp)})
    res["results"].append(r)
  res["all_pass"]=len(res["results"])==17; out=D/"candidate-assets.json"
 else:
  before={(x["path"],x["method"]):x for x in json.loads((D/"baseline.json").read_text())["results"]}
  for i,(p,m) in enumerate(BASE,1):
   r,body=get(p,phase,i,m); b=before[(p,m)]
   if p=="/hbnf-cart.html":
    if r["status"]!=200 or r["headers"].get("x-hbnf-candidate")!="cart2-owner-guest-r2-canonical-20261010": raise RuntimeError("canonical Owner route did not select Cart candidate")
    r["intentional_cart_route"]=True; r["matches_pre_route_baseline"]=False; res["results"].append(r); continue
   original=pathlib.Path(R/b["body_path"]).read_bytes() if m!="HEAD" else b""
   if r["status"]!=b["status"]: raise RuntimeError(f"site/firmware changed {p} status")
   if m!="HEAD" and r["sha256"]!=b["sha256"]:
    if r["headers"].get("content-type","").split(";",1)[0].lower()!="text/html": raise RuntimeError(f"site/firmware changed {p} sha256")
    canonical_before,jsd_before=strip_jsd(original); canonical_after,jsd_after=strip_jsd(body)
    if not jsd_before or not jsd_after or canonical_before!=canonical_after: raise RuntimeError(f"site HTML changed beyond Cloudflare JSD: {p}")
    r.update({"cloudflare_jsd_only_difference":True,"canonical_sha256":sha(canonical_after),"jsd_before_bytes":len(jsd_before),"jsd_after_bytes":len(jsd_after)})
   else: r["cloudflare_jsd_only_difference"]=False
   for key in ("content-type","location","cache-control","content-length"):
    if r["headers"].get(key)!=b["headers"].get(key): raise RuntimeError(f"site/firmware header changed {p} {key}")
   if r["headers"].get("etag")!=b["headers"].get("etag"):
    if not r.get("cloudflare_jsd_only_difference") or r["headers"].get("etag") is not None: raise RuntimeError(f"site/firmware changed {p} etag")
   if r["headers"].get("x-hbnf-candidate")=="cart2-owner-guest-r2-canonical-20261010": raise RuntimeError("candidate marker leaked "+p)
   r["matches_pre_route_baseline"]=True; res["results"].append(r)
  for i,p in enumerate(("/hbnf-cart-not-a-file","/hbnf-cart.html/child","/guest/hbnf-cart/unknown"),100):
   r,_=get(p,phase,i); b=before[(p,"GET")]
   if r["status"]!=b["status"] or r["sha256"]!=b["sha256"]: raise RuntimeError("real ASSETS fallback changed "+p)
   if r["headers"].get("x-hbnf-candidate")=="cart2-owner-guest-r2-canonical-20261010": raise RuntimeError("fallback marker leaked "+p)
   r["matches_pre_route_baseline"]=True; res["results"].append(r)
  res["all_pass"]=True; out=D/"candidate-fallback.json"
 out.write_text(json.dumps(res,indent=2,sort_keys=True)+"\n")
 print(json.dumps({"phase":phase,"file":str(out.relative_to(R)),"sha256":sha(out.read_bytes()),"count":len(res["results"]),"all_pass":res.get("all_pass")},indent=2))
if __name__=="__main__":main()

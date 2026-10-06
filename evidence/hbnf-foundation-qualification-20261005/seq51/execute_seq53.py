#!/usr/bin/env python3
import hashlib,json,pathlib,sys,time,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[3];OUT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(OUT))
import hbnf_foundation_seq41_transaction as tx
CAND=ROOT/'evidence/hbnf-foundation-qualification-20261005/seq39/artifact/firmware.bin';REL=ROOT/'evidence/hbnf-foundation-qualification-20261005/seq39/artifact/release07.bin'
NAME='hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1';BASE='hbnf-matrix-coordinated-v1-20261002-07';CS='338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c';RS='8e8db17786b178fc8fcd2cdf8a21512681ec7158941ee49ea255509970b1bcab'
def save(n,x): (OUT/n).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def get(url):
 import urllib.request
 with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept':'application/json','Cache-Control':'no-store'}),timeout=8) as r:return json.loads(r.read())
def runtime(want):
 mi=get('http://192.168.77.10/json/info');b=get('http://192.168.77.10/hbnf/build.json');s=get('http://192.168.77.10/json/state');a=get('http://192.168.77.11/json/info');h=s.get('HBNF',{});t=h.get('timing',{})
 if mi.get('ip')!='192.168.77.10' or mi.get('mac','').replace(':','').lower()!=tx.MAC:raise RuntimeError('matrix identity mismatch')
 if b.get('release_id')!=want or b.get('candidate')!=want or h.get('candidate')!=want:raise RuntimeError('runtime release identity mismatch')
 if a.get('ip')!='192.168.77.11' or a.get('mac','').replace(':','').lower()!=tx.AUX_MAC or a.get('live') is not True or a.get('lm')!='DDP' or a.get('lip')!='192.168.77.10':raise RuntimeError('AUX DDP identity/health failure')
 return {'release':want,'matrix_mac':mi.get('mac'),'uptime_seconds':t.get('uptimeSec'),'restart_count':0,'aux':{'live':True,'lm':'DDP','lip':'192.168.77.10'}}
def wait(want,timeout=150):
 end=time.monotonic()+timeout;last=None
 while time.monotonic()<end:
  try:return runtime(want)
  except Exception as e:last=f'{type(e).__name__}: {e}';time.sleep(2)
 raise RuntimeError('identity-not-obtained-promptly:'+str(want)+':'+str(last))
def direct_install(binary,seq,name,sha,size):
 remote=f'/tmp/hbnf-seq{seq}-candidate.bin'
 verify=("umask 077; cat > "+remote+" && chmod 600 "+remote+" && test \"$(sha256sum "+remote+" | cut -d' ' -f1)\" = "+sha+" && test \"$(wc -c < "+remote+" | tr -d ' ')\" = "+str(size)+" && printf ARTIFACT_VERIFIED")
 p=tx.run(tx.SSH+["-o","ConnectTimeout=8","-T",tx.OPAL,verify],90,pathlib.Path(binary).read_bytes())
 save(f'SEQ{seq}_OPAL_COPY.json',{'exit':p.returncode,'verified':p.returncode==0 and b'ARTIFACT_VERIFIED' in p.stdout,'sha256':sha,'size_bytes':size,'stderr':p.stderr.decode(errors='replace')[-1200:]})
 if p.returncode or b'ARTIFACT_VERIFIED' not in p.stdout: raise RuntimeError(f'seq{seq} exact Opal staging failed')
 response=f'/tmp/hbnf-seq{seq}-ota-response.html'
 command=("code=$(curl --silent --show-error --connect-timeout 5 --max-time 180 -F 'update=@"+remote+";type=application/octet-stream' -o "+response+" -w '%{http_code}' http://192.168.77.10/update); rc=$?; printf 'CURL_RC=%s HTTP=%s\\n' \"$rc\" \"$code\"; if test -f "+response+"; then sha256sum "+response+"; head -c 1200 "+response+"; fi; exit 0")
 try:
  p=tx.run(tx.SSH+["-o","ConnectTimeout=8",tx.OPAL,command],210)
  stdout=p.stdout;stderr=p.stderr;rc=p.returncode
 except subprocess.TimeoutExpired as e:
  stdout=e.stdout or b'';stderr=e.stderr or b'';rc=None
 (OUT/f'SEQ{seq}_OPAL_OTA_RESPONSE.txt').write_bytes(stdout+b'\nSTDERR\n'+stderr)
 return {'remote_command_exit':rc,'output_path':str(OUT/f'SEQ{seq}_OPAL_OTA_RESPONSE.txt'),'output':stdout.decode(errors='replace')[-1200:] if isinstance(stdout,bytes) else str(stdout)[-1200:],'timed_out':rc is None}
def main():
 if CAND.stat().st_size!=1489008 or hashlib.sha256(CAND.read_bytes()).hexdigest()!=CS:raise RuntimeError('candidate SHA/size failed')
 if REL.stat().st_size!=1458624 or hashlib.sha256(REL.read_bytes()).hexdigest()!=RS:raise RuntimeError('Release07 SHA/size failed')
 pre=runtime(BASE);save('SEQ53_PREINSTALL_RUNTIME.json',pre)
 result={'schema':'hbnf-seq53-targeted-transaction-v1','sequence':53,'recovery_sequence':54,'candidate':NAME,'candidate_sha256':CS,'status':'STARTED','preinstall':pre}
 save('SEQ53_TRANSACTION_STARTED.json',result)
 try:
  # Proven Opal-origin direct WLED multipart OTA. Always inspect runtime identity
  # after the request, even when the SSH command loses its response during reboot.
  install=direct_install(CAND,53,NAME,CS,1489008)
  installed=wait(NAME)
  tx.ledger_write(53,NAME,CS)
  save('SEQ53_CANDIDATE_INSTALLED.json',{'install':install,'runtime':installed})
  import importlib.util
  spec=importlib.util.spec_from_file_location('seq51target',OUT/'targeted_collector.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  payload=mod.collect_all(OUT/'targeted-seq53')
  save('SEQ53_COLLECTOR_RESULT.json',payload)
  if payload.get('status')!='PASS':raise RuntimeError('targeted validation failed: '+str(payload.get('error')))
  final=runtime(NAME)
  result.update({'status':'PASS','install':install,'runtime_after':final,'targeted_result_path':str(OUT/'targeted-seq53/SEQ51_TARGETED_RESULT.json'),'renderer_restore':payload.get('renderer_restore'),'candidate_left_installed':True})
  save('SEQ53_TRANSACTION_RESULT.json',result);return 0
 except Exception as e:
  result.update({'status':'FAIL','error':f'{type(e).__name__}: {e}'})
  save('SEQ53_FAILURE.json',result)
  # The fresh authority explicitly reserves seq54 for failure to obtain exact candidate identity or a genuine targeted gate failure.
  recovery=direct_install(REL,54,BASE,RS,1458624)
  recovered=wait(BASE)
  tx.ledger_write(54,BASE,RS)
  result.update({'status':'FAIL_RECOVERED','seq54_recovery':'PASS','recovery':recovery,'verified_release07':recovered})
  save('SEQ53_TRANSACTION_RESULT.json',result);return 2
if __name__=='__main__':raise SystemExit(main())

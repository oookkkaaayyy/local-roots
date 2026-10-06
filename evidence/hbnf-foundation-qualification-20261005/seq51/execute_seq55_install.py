import hashlib,json,pathlib,sys,time
P=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(P))
import execute_seq53 as common
C=common.CAND;R=common.REL;NAME=common.NAME;BASE=common.BASE;CS=common.CS;RS=common.RS

def save(n,x):(P/n).write_text(json.dumps(x,indent=2,sort_keys=True)+'\n')
def main():
 b=C.read_bytes();r=R.read_bytes()
 if len(b)!=1489008 or hashlib.sha256(b).hexdigest()!=CS:raise RuntimeError('candidate hash/size mismatch')
 if len(r)!=1458624 or hashlib.sha256(r).hexdigest()!=RS:raise RuntimeError('Release07 hash/size mismatch')
 pre=common.runtime(BASE);save('SEQ55_PREINSTALL_READONLY.json',pre)
 ota=common.direct_install(C,55,NAME,CS,1489008)
 try: first=common.wait(NAME,180)
 except Exception as e:
  try:base=common.runtime(BASE);save('SEQ55_INSTALL_NOT_OBTAINED_BASELINE_REMAINS.json',{'error':str(e),'runtime':base,'seq56_ota_needed':False})
  except Exception as health:raise RuntimeError(f'candidate identity not obtained and Release07 health unverified: {e}; {health}')
  raise RuntimeError(f'candidate identity not obtained; exact Release07 remains healthy; no redundant recovery upload: {e}')
 common.tx.ledger_write(55,NAME,CS)
 time.sleep(5)
 second=common.runtime(NAME)
 if int(second.get('uptime_seconds',-1))<int(first.get('uptime_seconds',-1)):raise RuntimeError('postinstall uptime regression')
 result={'schema':'hbnf-seq55-minimal-postinstall-v1','status':'PASS','sequence':55,'release':NAME,'sha256':CS,'size_bytes':1489008,'opal_origin_direct_wled_update':ota,'first_runtime':first,'stable_runtime_after_5s':second,'reused_evidence':{'seq53_targeted_28_28_56_56':'evidence/hbnf-foundation-qualification-20261005/seq51/SEQ53_COLLECTOR_RESULT.json','seq53_source_bound_restore':'evidence/hbnf-foundation-qualification-20261005/seq51/SEQ53_SEQ54_FINAL_RECONCILIATION.json','seq47_soak_and_performance':'evidence/hbnf-foundation-qualification-20261005/seq47/live/retry-20261006T2027Z'}}
 save('SEQ55_MINIMAL_POSTINSTALL_PASS.json',result);print(json.dumps(result,indent=2));return 0
if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as e:
  save('SEQ55_FAILURE.json',{'schema':'hbnf-seq55-minimal-postinstall-v1','status':'FAIL','error':f'{type(e).__name__}: {e}'})
  raise

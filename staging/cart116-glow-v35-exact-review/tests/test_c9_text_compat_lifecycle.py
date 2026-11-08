"""Bounded one-file Safari 12 transaction rehearsal in an isolated fake root."""
import hashlib,pathlib,subprocess,tempfile
S=pathlib.Path(__file__).resolve().parents[1]/'release/c9-six-file-opal.CANDIDATE.sh'
def sha(b):return hashlib.sha256(b).hexdigest()
with tempfile.TemporaryDirectory(dir='/tmp',prefix='cart116-c9-rehearsal-') as td:
 r=pathlib.Path(td);root=r/'root';root.mkdir();candidate=r/'candidate';candidate.mkdir()
 target='/www/mission-control-local/owner-pwa/hbnf-cart-features.js';parent=root/'www/mission-control-local/owner-pwa';parent.mkdir(parents=True)
 old=b'exact prior Safari feature bytes';new=b'corrected Safari 12 feature bytes';(parent/'hbnf-cart-features.js').write_bytes(old);(candidate/'hbnf-cart-features.js').write_bytes(new)
 rows=r/'target.tsv';rows.write_text('\t'.join((target,'hbnf-cart-features.js',sha(old),sha(new),'644'))+'\n')
 tx='c9-phase1a-3140788a963042b7bca03cc619f73287'
 def call(action,ok=True):
  p=subprocess.run(['sh',str(S),action,str(root),str(rows),str(candidate),tx],capture_output=True,text=True)
  assert (p.returncode==0)==ok,(action,p.stdout,p.stderr)
 call('preflight');call('prepare');assert (parent/'hbnf-cart-features.js').read_bytes()==old
 call('apply');assert (parent/'hbnf-cart-features.js').read_bytes()==new;call('verify');call('apply',False)
 call('restore');assert (parent/'hbnf-cart-features.js').read_bytes()==old;call('apply',False)
 print('PASS one-file allowlist, preflight, journal, install, verify, replay refusal, exact restore')

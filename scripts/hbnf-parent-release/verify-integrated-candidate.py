"""Verify the sole HBNF corrected 61-member integrated review ZIP and its preserved predecessor.
No network or deployment. Exact source/payload parity, no scoring data changes.
Usage: python3 scripts/hbnf-parent-release/verify-integrated-candidate.py <original-zip> <new-zip>
"""
import hashlib, json, pathlib, sys, zipfile
OLD_SHA='24c96d043c53c9060f032bef21c57662b2db188f02a9ec1adee2fc46addfc7e6'
NEW_SHA='bb684434721205345bb8faa67619cb4972e53f4b2e3439e4646b6491507fef2b'
NEW_GLOW_BLOB='62c277ab5fab1e6e1cda13bbcba88b1380130508'
NEW_GLOW_SHA='153cf29bc9ca10071506234cdcf4f7c95b4252ce0df66b256395cab1911ad400'
HEAD='9300e2011defc6d221df771a6850929ee077980f'
def sha(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def verify_zip(p,expected):
 b=p.read_bytes()
 if sha(b)!=expected: raise ValueError('ARCHIVE_SHA_DRIFT:'+p.name)
 with zipfile.ZipFile(p) as z:
  if z.testzip() is not None: raise ValueError('ZIP_CRC_FAILURE')
  names=z.namelist()
  if len(names)!=61 or len(set(names))!=61 or 'PACKAGE_MANIFEST.json' not in names: raise ValueError('PACKAGE_MEMBER_SET_DRIFT')
  if any(x.startswith('/') or '..' in pathlib.PurePosixPath(x).parts for x in names): raise ValueError('ZIP_TRAVERSAL')
  entries={n:z.read(n) for n in names}
  manifest=json.loads(entries['PACKAGE_MANIFEST.json'])
  records=manifest.get('files')
  if not isinstance(records,list) or len(records)!=60 or set(x['path'] for x in records)!=set(names)-{'PACKAGE_MANIFEST.json'}: raise ValueError('PACKAGE_MANIFEST_SET_DRIFT')
  for rec in records:
   data=entries[rec['path']]
   if len(data)!=rec['bytes'] or sha(data)!=rec['sha256']: raise ValueError('MEMBER_SHA_DRIFT:'+rec['path'])
 return entries,manifest
def main(a,b):
 old,oldm=verify_zip(a,OLD_SHA)
 new,newm=verify_zip(b,NEW_SHA)
 changed=[p for p in old if p!='PACKAGE_MANIFEST.json' and old[p]!=new[p]]
 if changed!=['public/glow.html']: raise ValueError('UNEXPECTED_PRODUCT_PAYLOAD_CHANGED:'+repr(changed))
 if sha(new['public/glow.html'])!=NEW_GLOW_SHA or blob(new['public/glow.html'])!=NEW_GLOW_BLOB: raise ValueError('GLOW_PR_SOURCE_MISMATCH')
 if newm.get('deploymentAuthorized') is not False or newm.get('reviewOnly') is not True or newm.get('reviewSourceCommit')!=HEAD: raise ValueError('REVIEW_ONLY_SOURCE_GATE_FAILED')
 if newm.get('sourceProof',{}).get('quickImportContainmentGitBlob')!=NEW_GLOW_BLOB: raise ValueError('SOURCE_PROVENANCE_NOT_BOUND')
 return {'status':'REVIEW_ONLY_NOT_ADMITTED','candidateSha256':NEW_SHA,'changedPayload':changed,'unchangedPayloadCount':59,'downloadBackMustBeVerifiedSeparately':True}
if __name__=='__main__':
 try:
  if len(sys.argv)!=3: raise ValueError('expected original-zip and candidate-zip')
  print(json.dumps(main(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))))
 except Exception as e:
  sys.stderr.write(str(e)+'\n');sys.exit(1)

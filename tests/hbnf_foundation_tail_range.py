#!/usr/bin/env python3
"""Static proof for the bounded seq39 fixed-memory telemetry range change."""
import hashlib, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/'firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1_base.cpp'
CAND=ROOT/'firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp'
MANIFEST=ROOT/'firmware/packet20/seq39-tail250/SOURCE_MANIFEST.json'
PATCH=ROOT/'firmware/packet20/seq39-tail250/source-diff.patch'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads(MANIFEST.read_text());base=BASE.read_text();candidate=CAND.read_text()
old='hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1'
new=m['candidate_release']
assert sha(BASE)==m['base_source_sha256']
assert sha(CAND)==m['candidate_source_sha256']
assert base.count(old)==3 and candidate.count(new)==3 and old not in candidate.replace(new,'')
assert base.count('HBNF_TAIL_BIN_US=100')==1
expected=(base.replace('// Fixed 50-us bins collect real per-frame samples with bounded memory and no',
                       '// Fixed 250-us bins collect real per-frame samples with bounded memory and no',1)
              .replace('HBNF_TAIL_BIN_US=100','HBNF_TAIL_BIN_US=250',1)
              .replace(old,new))
assert candidate==expected, 'candidate source has an unrelated delta'
assert 'HBNF_TAIL_BINS=512' in candidate
assert 'hbnfTailHist[8][HBNF_TAIL_BINS]' in candidate
assert 'if(values[metric]>hbnfTailMax[metric])hbnfTailMax[metric]=values[metric]' in candidate
assert 'HBNF_TAIL_BIN_US=250' in candidate and 'HBNF_TAIL_BIN_US=100' not in candidate
assert m['tail_bin_count']==512 and m['tail_bin_us']==250
assert m['quantile_saturation_midpoint_ms']==127.875 and m['foundation_frame_p99_ceiling_ms']==75
assert PATCH.stat().st_size>0
print('PASS: exact 100->250us telemetry-bin change, fixed 512-bin memory, candidate identity only, max tracking/render source unchanged')

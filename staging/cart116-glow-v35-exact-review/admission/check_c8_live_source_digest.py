#!/usr/bin/env python3
"""C8 LIVE lineage source-review digest gate. Read-only, no provider or device access.

This deliberately does NOT repin or bypass the historical immutable C6/C7
source-equivalent restore checker. The older C7 candidate tree/ZIP is stale
after the reviewed C8 live-source change and stays NON-INSTALLABLE.
"""
import hashlib
import json
import pathlib
import sys

ROOT=pathlib.Path("staging/cart116-glow-v35-exact-review")
EXPECTED={
 "planner":("candidate-source/hbnf-glow-cart-intent.mjs","cb40cfaa1e912b971ed5941d9226cf2b39445e8e"),
 "sql_up":("migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql","545c1e5bdbd96f631007f6f9f1fdbc84c47a8bc1"),
 "node_contract_fixture":("tests/native-release/c7-source-intent-contract.test.mjs","e188689349fabae05a9486a332a5cc8651d97bb2"),
 "pg17_contract_fixture":("tests/native-release/c7-pg-source-cas.sh","667e51d64f1c8adc8116c3c043ec53828bc75c5a"),
}
STATIC={
 "migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql":"7d5271d1aaa7a1acaf5dcce16448030c79ff3e3b",
 "candidate-source/index.ts":"4d7d978e1e9312693a6b48d7fe9c5c572cd487cc",
 "candidate-source/glow-intent-service.mjs":"e99e26ea452f97bda365fe067e93e9462e0bc3ec",
 "admission/check_c6_source_restore.py":"d1ebb35f03d29c1b6724ebbb81bbff0b17a33777",
}
def check(ok,label):
 if not ok: raise AssertionError(label)
def blob(data):
 return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def take(path):
 f=ROOT/path
 check(f.is_file() and not f.is_symlink(),"Missing or symlink: "+path)
 return f.read_bytes()
def verify():
 m=json.loads(take("admission/ADMISSION.PENDING.json"))
 c8=m.get("dora_c8_scoring_live_provenance_20261105",{})
 check(c8.get("status")=="SOURCE_REVIEW_ONLY_NOT_INSTALLABLE","C8 live admission incorrectly enabled")
 check(c8.get("touched_review_git_blobs")=={key:expected_sha for key,(_,expected_sha) in EXPECTED.items()},
       "C8 source-to-manifest digest closure changed")
 for label,(path,expected_sha) in EXPECTED.items():
  check(blob(take(path))==expected_sha,"Changed candidate blob mismatch: "+label)
 for path,expected_sha in STATIC.items():
  check(blob(take(path))==expected_sha,"Unchanged source/recovery blob drift: "+path)
 planner=take(EXPECTED["planner"][0]).decode("utf8")
 up=take(EXPECTED["sql_up"][0]).decode("utf8")
 service=take("candidate-source/glow-intent-service.mjs").decode("utf8")
 edge=take("candidate-source/index.ts").decode("utf8")
 for marker in [
  "UDisc explicitly authorized live source",
  "hbnf.udisc.live-lineage.v1",
  "EXPLICITLY_AUTHORIZED_IN_ROUND",
  "VERIFIED_PROVIDER_RECENT",
  "permissionReference",
  "liveSourceReceipt",
 ]:
  check(marker in planner,"Live planner lineage missing: "+marker)
  check(marker in up,"Live SQL lineage missing: "+marker)
 check("SAVED_SOURCE_REVISION_NOT_CONFIRMED" in planner,"Live planner rejection missing")
 check("v.cursor===lineage?.cursor" in planner,"C8 latest scored cursor binding missing")
 check(up.count("score->>'cursor'=v_week#>>'{udiscLive,cursor}'")==2,"C8 both snapshot and commit latest scored cursor gates missing")
 check(up.count("AND score->>'strokes' ~ '^[0-9]{1,2}$'")==2,"C8 valid stroke predicate missing or duplicated")
 check(up.count("CREATE FUNCTION public.hbnf_cart_glow_source_snapshot(")==1 and
       up.count("CREATE FUNCTION public.hbnf_cart_commit_glow_intent(")==1 and
       up.count("CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_issue(")==1 and
       up.count("CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_authorize(")==1 and
       up.count("CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_ack(")==1 and
       up.count("CREATE FUNCTION public.hbnf_cart_glow_overlay_v1_restored(")==1,
       "C8 SQL duplicated or missing six RPC boundaries")
 check(up.count("\\nCOMMIT;\\n")==1 and up.count("$commit$")==2 and up.count("$snapshot$")==2,"C8 SQL duplicated transaction or unbalanced function body")
 check("UDisc event XLSX export" not in planner,"Manual XLSX accepted by LIVE planner")
 check("UDisc event XLSX export" in up and "HISTORICAL_PREVIEW_ONLY_NO_ACTUATION" in up,
       "Historical XLSX read-only snapshot mode lost")
 check("historical_source_not_qualified" in up and "live_provider_timestamp_stale" in up,
       "Live/historical SQL transaction guards missing")
 check("glow_scoreboard_preview" in service and "HISTORICAL_READ_ONLY" in service
       and "actuationAllowed:false" in service and "nativeOverlayAdmitted!==true" in service,
       "Read-only historic Edge path became actuating")
 check("nativeOverlayAdmitted:false" in edge,"Deployed-candidate native overlay source flag not false")
 check(m.get("state")=="PENDING_NOT_INSTALLABLE_NO_LIVE_MUTATION"
       and m.get("candidate_archive",{}).get("installable") is False,
       "Old C8 candidate package promoted to installable")
 check(m.get("firmware",{}).get("matrix_flash") is False
       and m.get("transaction",{}).get("source_gate_change_admitted") is False,
       "Physical/provider flags promoted")
 paired=m.get("dora_c9_paired_owner_release_20261105",{})
 check(paired.get("status")=="SOURCE_INTEGRATED_REVIEW_ONLY_NOT_INSTALLABLE"
       and len(paired.get("changed_targets",[]))==6
       and all(x.get("actual_installed_preimage_sha256") is None for x in paired["changed_targets"]),
       "C9 hardware installation/preimage status misrepresented")
 check(m.get("dora_c8_scoring_live_provenance_20261105",{}).get("c8_old_archive","").startswith("STALE"),
       "Old C8 packaged candidate not explicitly stale")
 return {"lineage_candidate_blobs":4,"unchanged_recovery_blobs":4,
         "historical_c6_c7_restore_validator":"PRESERVED_UNCHANGED_NOT_REPINNED",
         "C8":"REVIEW_SOURCE_ONLY","C9":"NO_DEVICE_INSTALL"}
if __name__=="__main__":
 try: print("PASS_C8_LIVE_LINEAGE_SOURCE_DIGEST:",json.dumps(verify(),sort_keys=True))
 except (AssertionError,KeyError,ValueError,TypeError,OSError) as error:
  print("FAIL_C8_LINEAGE_INTEGRITY:",str(error));sys.exit(43)

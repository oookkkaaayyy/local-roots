#!/usr/bin/env python3
"""Read-only source recovery METHOD validator for the ONE Cart116 admission manifest.

Exit 0 = static source/rollback method PASS, NOT deployment/install approval.
Exit 42 = static method intact but live admission not established.
Exit 43 = source, candidate, scope or manifest integrity mismatch.
Never calls GitHub, Supabase, SSH, WLED, an installer or credentials.
"""
import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path("staging/cart116-glow-v35-exact-review")
ORIGINAL = "74dd1d687de44eacb20eff8e3960d9129948ef88"
CANDIDATE = "7c5ddec5c06a25e9187e98663db7210038449404"
C3_CAPTURE = "6c8c96385d16b1230730df86f1791b492bca18144df71d2b1bdf521b3c533b2a"
R6_ORIGINAL = "de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d"
R6_REVIEW = "85796804b3436b890918206c3c371973dc6b08337ad4f67bfc7d769b7dc8cb16"
S1_WEEK = "90494f540fc2ae184fdd142d70b99334"

class IntegrityError(Exception):
    pass

def demand(condition, error):
    if not condition:
        raise IntegrityError(error)

def read_file(path):
    demand(path.is_file() and not path.is_symlink(), "missing or unsafe source: " + str(path))
    return path.read_bytes()

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def git_tree(files):
    payload = b"".join(b"100644 " + name.encode() + b"\0" + bytes.fromhex(blob)
                       for name,blob in sorted(files.items()))
    return hashlib.sha1(b"tree " + str(len(payload)).encode() + b"\0" + payload).hexdigest()

def verify_tree(directory, expected, tree_hash):
    actual_names = {str(x.relative_to(directory)) for x in directory.rglob("*")
                    if x.is_file() or x.is_symlink()}
    demand(actual_names == set(expected), "unexpected or missing files in " + str(directory))
    checked = {}
    for name, expected_blob in expected.items():
        actual_blob = git_blob(read_file(directory / name))
        demand(actual_blob == expected_blob, "Git blob mismatch: " + name)
        checked[name] = actual_blob
    demand(git_tree(checked) == tree_hash, "Git tree identity mismatch in " + str(directory))

def audit(m, work):
    demand(m["state"] == "PENDING_NOT_INSTALLABLE_NO_LIVE_MUTATION", "unauthorized live-state promotion")
    demand(m["candidate_archive"]["installable"] is False, "old eleven-target package became installable")
    demand(m["transaction"]["source_gate_change_admitted"] is False, "source actuation already enabled")
    demand(m["transaction"]["owner_approval_for_this_exact_postimage"] is None, "release approval falsely claimed")
    demand(m["firmware"]["matrix_flash"] is False and m["backend_or_opal_mutated"] is False,
           "unexpected installed mutation")
    q=m["dora_c6_20261104"]
    original=q["exact_provider_v35_existing_installed"]
    candidate=q["narrow_compiled_edge_successor_source"]
    s=q["immutable_minimal_release_scope"]
    demand(original["project"]=="phcpbvuqibyarpfrftgx" and original["function_slug"]=="hbnf-cart-control",
           "wrong provider target")
    demand(original["version"]==35 and original["status"]=="ACTIVE"
           and original["entrypoint"]=="index.ts" and original["import_map_path"]=="deno.json"
           and original["verify_jwt"] is False, "deployed configuration drift")
    demand(original["source_tree_git_SHA1"]==ORIGINAL and
           original["provider_10_versus_exact_git_blob_10"] ==
           "PASS_ALL_10_DIRECT_BYTE_STRING_EQUAL_NO_NORMALIZATION", "deployed source evidence not accepted")
    demand(candidate["reviewed_candidate_tree_git_SHA1"]==CANDIDATE, "candidate tree drift")
    o={n:sha for n,sha,size in original["original_file_shas"]}
    demand(len(o)==len(original["original_file_shas"])==10, "original file set incomplete")
    c=dict(o)
    for name,blob in candidate["added"]:
        demand(name not in c, "new source overwrites original")
        c[name]=blob
    changed=set()
    for name,old,new in candidate["modified"]:
        demand(o.get(name)==old and name not in changed, "modified source old identity mismatch")
        c[name]=new
        changed.add(name)
    demand(len(c)==15 and len(candidate["added"])==5 and len(changed)==2, "candidate file count drift")
    demand(set(candidate["identical_unchanged_eight"])==set(o)-changed,
           "unchanged source closure drift")
    demand(candidate["all_local_relative_imports_resolved"].startswith("PASS_15_EDGES_ZERO_MISSING"),
           "candidate relative imports not closed")
    verify_tree(work/"rollback-v35",o,ORIGINAL)
    verify_tree(work/"candidate-source",c,CANDIDATE)
    sql=s["SQL"]
    demand(git_blob(read_file(work/"migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql")) ==
           sql["up_git_blob"], "SQL forward source mismatch")
    demand(git_blob(read_file(work/"migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql")) ==
           sql["down_git_blob"], "SQL inverse source mismatch")
    exact={
        "/usr/libexec/hbnf-cart-glow-bridge":"opal/new-service/usr/libexec/hbnf-cart-glow-bridge",
        "/etc/init.d/hbnf-cart-glow-bridge":"opal/new-service/etc/init.d/hbnf-cart-glow-bridge",
        "/usr/libexec/hbnf-cart-glow-provision":"opal/new-service/usr/libexec/hbnf-cart-glow-provision",
        "/usr/lib/hbnf-glow-overlay-v1.sh":"opal/hbnf-glow-overlay-v1.sh"
    }
    postimages=s["opal"]["candidate_postimages"]
    actual={"/"+path:digest for path,digest in postimages}
    demand(len(actual)==len(postimages)==4 and set(actual)==set(exact),
           "four-target boundary changed or Owner PWA replacement attempted")
    for dest,source in exact.items():
        digest=hashlib.sha256(read_file(work/source)).hexdigest()
        demand(actual[dest]==digest, "source SHA-256 mismatch: "+dest)
    demand(s["excluded_seven_existing_owner_PWA_target_replacements"] is True,
           "Owner PWA preservation not declared")
    p=m["installed_opal_c3_capture_20261104"]
    demand(p["zip_sha256"]==C3_CAPTURE and
           p["independent_downloadback"]["byte_equal_to_owner_uploaded"] is True,
           "C3 original source backup not durable")
    demand(len(p["targets"])==4 and {a["path"] for a in p["targets"]}==set(exact)
           and all(a["status"]=="ABSENT" for a in p["targets"]), "Opal target preimage not verified absent")
    demand(p["protected_config"]["status"]=="ABSENT" and
           p["protected_config"]["contents_accessed"] is False, "protected config state unsafe")
    fw=q["original_r6_installed_source_build_transaction_witness"]
    demand(fw["rollback_artifact_sha256"]==R6_ORIGINAL and
           fw["original_target_corrected_candidate_sha256"]==R6_REVIEW and
           "WITNESS_PASS" in fw["gate_result"] and
           fw["installed_raw_flash_sha256"] is None and
           fw["firmware_flash_authorized"] is False,
           "R6 original install witness/source-only status mismatch")
    score=q["score_dependency"]
    demand(score["S1_week_md5"]==S1_WEEK and
           score["status"].startswith("PRODUCTION_SCORE_DEPENDENCY_PASS"),
           "authoritative S1 score proof missing")
    edge=m["dora_c7_20261104"]["edge_source_equivalent_governance"]
    demand(edge["policy_id"]=="CART116_EDGE_V35_SOURCE_EQUIVALENT_RESTORE_CONDITIONAL_V1"
           and edge["status"]=="METHOD_ACCEPTED_CONDITIONAL_LIVE_RECOVERY_NOT_VERIFIED"
           and edge["compiled_eszip_equivalence_claimed"] is False,
           "source-equivalent governance policy absent or overstated")
    idx=read_file(work/"candidate-source/index.ts")
    relay=read_file(work/"candidate-source/matrix-relay.ts")
    helper=read_file(work/"opal/hbnf-glow-overlay-v1.sh")
    bridge=read_file(work/"opal/new-service/usr/libexec/hbnf-cart-glow-bridge")
    demand(b"nativeOverlayAdmitted:false" in idx and b"admitted:false" in relay
           and b"HBNF_OVERLAY_V1_SOURCE_ADMITTED=false" in helper
           and b"HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED=false" in helper
           and b"HBNF_CART_GLOW_SOURCE_ADMITTED=false" in bridge,
           "review-only actuation guard has changed")
    return dict(original_source_files=10,candidate_source_files=15,Opal_targets=4,
                original_git_tree=ORIGINAL,candidate_git_tree=CANDIDATE)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo-root",type=pathlib.Path,default=pathlib.Path("."))
    ap.add_argument("--manifest",type=pathlib.Path)
    ap.add_argument("--phase",choices=["source","release"],default="source")
    args=ap.parse_args()
    work=args.repo_root/ROOT
    try:
        manifest=json.loads(read_file(args.manifest or work/"admission/ADMISSION.PENDING.json"))
        proof=audit(manifest,work)
    except (IntegrityError,KeyError,TypeError,ValueError,OSError) as err:
        print("FAIL_INTEGRITY:",str(err));return 43
    print("PASS_STATIC_SOURCE_EQUIVALENT_METHOD:",json.dumps(proof,sort_keys=True))
    if args.phase=="release":
        print("BLOCK_LIVE_ADMISSION: independent fresh provider/device evidence, exact enabled postimages, trusted same-manifest recovery closeout still required")
        return 42
    print("SOURCE_ONLY: never authorizes SQL/Edge/Opal/flash/Owner PWA mutation")
    return 0

if __name__=="__main__":
    sys.exit(main())

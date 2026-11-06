"""#116 C9 six-file package: deterministic, exact source, no live permission."""
import importlib.util
import json
import pathlib
import tempfile
import zipfile

BUILDER=pathlib.Path(__file__).resolve().parents[1]/"release/build_c9_phase1a_review.py"
spec=importlib.util.spec_from_file_location("cart116_c9_review_builder",BUILDER)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix="cart116-c9-package-",dir="/tmp") as td:
    root=pathlib.Path(td)
    one,two=root/"review-one.zip",root/"review-two.zip"
    module.emit(one)
    module.emit(two)
    assert one.read_bytes()==two.read_bytes(),"same input must produce identical package bytes"
    with zipfile.ZipFile(one) as z:
        assert len(z.namelist())==11
        assert z.testzip() is None
        receipt=json.loads(z.read("REVIEW_RECEIPT.json"))
        assert receipt["disposition"]=="REVIEW_ONLY_NOT_INSTALLABLE_NO_ADMISSION_RECEIPT"
        assert receipt["source_gate_admitted"] is False
        assert receipt["contains_installed_backup_bytes"] is False
        assert receipt["contains_live_install_receipt"] is False
        assert "candidate/ADMISSION.RECEIPT" not in z.namelist()
        assert "six.tsv" in z.namelist()
        rows=z.read("six.tsv").decode().splitlines()
        assert len(rows)==6
        assert len({x.split("\t")[0] for x in rows})==6
        assert all(len(x.split("\t"))==5 and x.split("\t")[4]=="644" for x in rows)
        assert len([x for x in z.namelist() if x.startswith("candidate/")])==7
        assert len([x for x in z.namelist() if x.startswith("release/")])==2
        assert all(z.getinfo(k).date_time==(2020,1,1,0,0,0) for k in z.namelist())
    # Refuse stale source manifest/rollback lineage, with no source directory mutation.
    original=module.MANIFEST
    stale=json.loads(original.read_text())
    stale["dora_c9_paired_owner_release_20261105"]["changed_targets"][0]["candidate_sha256"]="0"*64
    mutated=root/"tampered.json"
    mutated.write_text(json.dumps(stale))
    module.MANIFEST=mutated
    try:
        module.emit(root/"must-not-build.zip")
        raise AssertionError("tampered candidate SHA did not fail closed")
    except AssertionError as error:
        assert "candidate source SHA drift" in str(error), str(error)
    finally:
        module.MANIFEST=original
    assert not (root/"must-not-build.zip").exists()
    print("PASS: 11-member deterministic C9 six-target review ZIP, exact hashes, no live gate; tamper refusal")

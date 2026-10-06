#!/usr/bin/env python3
"""Offline safety and timeout-budget regression checks for the seq47 retry path."""
import importlib.util
import pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("seq47_retry",ROOT/"scripts/hbnf_foundation_seq47_soak_retry.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert 0 < m.opal.CURL_TIMEOUT_SECONDS < m.opal.SSH_COMMAND_TIMEOUT_SECONDS < 12.5 < 15
snap={"snapshotId":1,"snapshotHash":2829015731}
raw={"HBNF":{"packet20Diagnostic":{"restoreVerified":True,"snapshotId":1,"snapshotHash":2829015731}}}
bodies={
 "matrix_info":{"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"},
 "matrix_build":{"release_id":m.CANDIDATE,"candidate":m.CANDIDATE},
 "matrix_state":{"HBNF":{"timing":{"uptimeSec":2503}}},
 "aux_info":{"ip":"192.168.77.11","mac":"8c:94:df:55:c3:4c","live":True,"lm":"DDP","lip":"192.168.77.10"},
 "aux_state":{},
}
last={"restart_count":0,"uptime_seconds":2502}
checks=m.post_restore_safety_checks(bodies,snap,raw,True,2502,last)
assert all(checks.values()),checks
assert not all(m.post_restore_safety_checks(bodies,snap,raw,False,2502,last).values())
reboot={**bodies,"matrix_state":{"HBNF":{"timing":{"uptimeSec":2}}}}
assert not all(m.post_restore_safety_checks(reboot,snap,raw,True,2502,last).values())
bad_aux={**bodies,"aux_info":{**bodies["aux_info"],"live":False}}
assert not all(m.post_restore_safety_checks(bad_aux,snap,raw,True,2502,last).values())
print("PASS: same-candidate host retry safety checks preserve only exact identity, uptime/restart continuity, verified restore, and Matrix-origin AUX health")

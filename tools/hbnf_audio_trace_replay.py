#!/usr/bin/env python3
"""Replay a source-bound WLED AudioReactive UDP v2 capture through P2 candidates."""
from __future__ import annotations
import argparse, hashlib, json, statistics, time
from collections import Counter
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.hbnf_vibe_audio_replay import AudioFeaturesCandidate, AutoSelectorCandidate, FEATURE_NAMES, vibe_response, response_distance

def run(trace: Path, config_path: Path) -> dict:
    rows=[json.loads(line) for line in trace.read_text().splitlines()]
    metadata=rows[0]
    samples=[x for x in rows[1:] if x.get("record_type")=="sample"]
    if not samples: raise ValueError("capture contains no samples")
    wrong=[x for x in samples if x.get("source_ip")!=metadata["expected_source_ip"]]
    if wrong: raise ValueError("trace contains samples from unexpected source")
    cfg=json.loads(config_path.read_text())
    extractor=AudioFeaturesCandidate(); selector=AutoSelectorCandidate(cfg["auto"]["minimum_dwell_seconds"],cfg["auto"]["switch_margin"])
    axes=cfg["response_axes"]; vibes=cfg["vibes"]
    samples.sort(key=lambda x:x["sequence"])
    features_rows=[]; vibe_rows=[]; sample_results=[]; auto_switches=[]; costs=[]; dt_values=[]; replay_elapsed=0.0
    # The WLED v2 packet has no sender timestamp. Local multicast receive was
    # observed in OS-buffer bursts, so evenly distribute the verified capture
    # span across its sequence-ordered packets instead of treating dequeue
    # jitter as audio timing.
    capture_span=max(.001,samples[-1]["monotonic_seconds"]-samples[0]["monotonic_seconds"])
    nominal_dt=max(.001,min(.25,capture_span/max(1,len(samples)-1)))
    for s in samples:
        dt=nominal_dt; dt_values.append(dt)
        replay_elapsed+=dt
        start=time.perf_counter_ns()
        f=extractor.update(s["fft_result"],s["sample_smth"],s["sample_peak"],dt)
        responses={name:vibe_response(f,g) for name,g in vibes.items()}
        chosen=selector.update(f,dt)
        costs.append((time.perf_counter_ns()-start)/1000)
        features_rows.append(f); vibe_rows.append(responses)
        sample_results.append({"record_type":"derived_sample","sequence":s["sequence"],"replay_time_s":replay_elapsed,"features":f,"manual_vibes":responses,"auto_vibe":chosen})
        if not auto_switches or auto_switches[-1]["vibe"]!=chosen:
            auto_switches.append({"sequence":s["sequence"],"time_s":replay_elapsed,"vibe":chosen})
    pairwise={}
    names=list(vibes)
    for i,left in enumerate(names):
        for right in names[i+1:]:
            pairwise[f"{left}/{right}"]=statistics.mean(response_distance(a[left],a[right],axes) for a in vibe_rows)
    byfeature={name:[f[name] for f in features_rows] for name in FEATURE_NAMES}
    band_energy={"bass_bins_0_3":[],"mid_bins_4_10":[],"high_bins_11_15":[]}
    for s in samples:
        b=s["fft_result"]
        band_energy["bass_bins_0_3"].append(sum(b[0:4])/4/255)
        band_energy["mid_bins_4_10"].append(sum(b[4:11])/7/255)
        band_energy["high_bins_11_15"].append(sum(b[11:16])/5/255)
    dominant=Counter(max(band_energy,key=lambda k:band_energy[k][i]) for i in range(len(samples)) if max(band_energy[k][i] for k in band_energy)>0)
    band_features={
        "bass_bins_0_3":("low_pressure","low_transient"),
        "mid_bins_4_10":("mid_body","mid_change"),
        "high_bins_11_15":("high_detail","high_transient"),
    }
    band_axes={}
    for band,feature_names in band_features.items():
        deltas={axis:[] for axis in axes}
        for f in features_rows:
            full={name:vibe_response(f,grammar) for name,grammar in vibes.items()}
            ablated=dict(f)
            for feature in feature_names: ablated[feature]=0.0
            for name,grammar in vibes.items():
                reduced=vibe_response(ablated,grammar)
                for axis in axes: deltas[axis].append(abs(full[name][axis]-reduced[axis]))
        band_axes[band]={axis:statistics.mean(v) for axis,v in deltas.items()}
    def summary(v):
        z=sorted(v)
        return {"min":z[0],"median":statistics.median(z),"p90":z[int(.9*(len(z)-1))],"max":z[-1],"nonzero":sum(x>0 for x in z)}
    report={
        "schema":"hbnf-audioreactive-udp-v2-replay-v1","trace_sha256":hashlib.sha256(trace.read_bytes()).hexdigest(),
        "source":{"release_id":metadata["release_id"],"firmware_sha256":metadata["firmware_sha256"],"source_ip":metadata["expected_source_ip"],"source_mac_from_readonly_info":metadata["expected_source_mac"]},
        "capture":{"sample_count":len(samples),"duration_s":samples[-1]["monotonic_seconds"]-samples[0]["monotonic_seconds"],"all_packets_from_matrix":not wrong,"audio_recording":False},
        "features":{k:summary(v) for k,v in byfeature.items()},"bands_normalized":{k:summary(v) for k,v in band_energy.items()},
        "dominant_active_sample_counts":dict(dominant),"manual_vibe_pairwise_mean_response_distance":pairwise,
        "minimum_pairwise_mean_distance":min(pairwise.values()),"auto_switches":auto_switches,
        "band_to_visual_axis_mean_absolute_response_delta":band_axes,
        "replay_time_model":"uniform sequence spacing over captured wall-span; packet protocol has no sender timestamp and local receive queue delivered bursts",
        "host_replay_cost_us":{"median":statistics.median(costs),"p95":sorted(costs)[int(.95*(len(costs)-1))],"max":max(costs)},
        "embedded_runtime_budget_comparison":"not measurable from host replay; requires instrumented candidate runtime and must remain a live design-review gate",
        "dt_s":{"median":statistics.median(dt_values),"min":min(dt_values),"max":max(dt_values)},
        "interpretation":"feature replay and measurable signal coverage only; subjective Vibe rendering acceptance is deferred to the first integrated Matrix design-review candidate",
        "_derived_samples":sample_results
    }
    return report

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--trace",type=Path,required=True); ap.add_argument("--config",type=Path,default=Path("config/HBNF_P2_VIBE_AUDIO_CANDIDATE_V1.json")); ap.add_argument("--out",type=Path,required=True); ap.add_argument("--samples-out",type=Path)
    a=ap.parse_args(); report=run(a.trace,a.config); samples=report.pop("_derived_samples"); a.out.parent.mkdir(parents=True,exist_ok=True); a.out.write_text(json.dumps(report,indent=2)+"\n")
    if a.samples_out:
        a.samples_out.parent.mkdir(parents=True,exist_ok=True); a.samples_out.write_text("".join(json.dumps(x,separators=(",",":"))+"\n" for x in samples))
    print(json.dumps({"result":"PASS","samples":report["capture"]["sample_count"],"trace_sha256":report["trace_sha256"],"out":str(a.out),"samples_out":str(a.samples_out) if a.samples_out else None}))
if __name__=="__main__": main()

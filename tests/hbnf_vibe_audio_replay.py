#!/usr/bin/env python3
"""Pure host regression for the pre-freeze HBNF Vibe/audio candidate."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hbnf_vibe_audio_replay", ROOT/"tools"/"hbnf_vibe_audio_replay.py")
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

CONFIG = json.loads((ROOT/"config"/"HBNF_P2_VIBE_AUDIO_CANDIDATE_V1.json").read_text())
MANUAL = ["CHILL","GROOVE","HEAVY","PSYCHEDELIC","COSMIC"]

def trace(kind: str, count: int=220):
    for index in range(count):
        fft=[10]*16; volume=30; peak=False
        if kind=="silence":
            fft=[0]*16; volume=0
        elif kind=="isolated_kick" and 40<=index<48:
            for bin_index in range(0,4): fft[bin_index]=230
            volume=140; peak=index<42
        elif kind=="sustained_bass" and index>=40:
            for bin_index in range(0,4): fft[bin_index]=170
            volume=110
        elif kind=="mid_swell" and 40<=index<120:
            level=min(210,20+(index-40)*3)
            for bin_index in range(4,11): fft[bin_index]=level
            volume=120
        elif kind=="high_transient_burst" and 40<=index<48:
            for bin_index in range(11,16): fft[bin_index]=230
            volume=140; peak=index<42
        elif kind=="steady_broadband":
            fft=[210]*16; volume=220
        yield fft,volume,peak,0.02

def run(kind: str):
    extractor=module.AudioFeaturesCandidate()
    return [extractor.update(fft,volume,peak,dt) for fft,volume,peak,dt in trace(kind)]

def check(condition,message):
    if not condition: raise AssertionError(message)

def main() -> int:
    check(tuple(CONFIG["audio_features"]["semantic_features"])==module.FEATURE_NAMES,"feature contract drift")
    adapter=CONFIG["audio_features"]["source_adapter"]
    check(set(adapter)==set(module.FEATURE_NAMES),"source adapter does not cover every AudioFeatures semantic")
    check(all("SECOND_FFT" not in entry["operation"] for entry in adapter.values()),"source adapter introduces a second FFT")
    fft_entries=[entry for entry in adapter.values() if any("fftResult" in source for source in entry["sources"])]
    check(fft_entries and all("NO_NEW_FFT" in entry["operation"] for entry in fft_entries),"existing FFT-bin consumers must explicitly forbid a new FFT")
    for kind in CONFIG["acceptance"]["synthetic_traces"]:
        for sample in run(kind):
            check(set(sample)==set(module.FEATURE_NAMES),f"{kind}: missing feature")
            check(all(0.0<=value<=1.0 for value in sample.values()),f"{kind}: out-of-range feature")

    silence=run("silence")[-1]
    check(silence["silence_confidence"]>0.95 and silence["activity"]<0.05,"silence gate")

    kick=run("isolated_kick")
    check(max(row["low_transient"] for row in kick)>0.70,"kick lacks low transient")
    check(max(row["low_transient"] for row in kick)>max(row["high_transient"] for row in kick)+0.40,"kick band separation")

    high=run("high_transient_burst")
    check(max(row["high_transient"] for row in high)>0.70,"high burst lacks high transient")
    check(max(row["high_transient"] for row in high)>max(row["low_transient"] for row in high)+0.40,"high band separation")

    sustained=run("sustained_bass")
    check(sustained[-1]["low_pressure"]>0.55,"sustained bass lacks pressure")
    check(sustained[-1]["low_transient"]<0.08,"sustained bass falsely remains transient")

    broadband=run("steady_broadband")[-1]
    check(sum(value>0.95 for value in broadband.values())<=2,"steady loud input pins too many features")

    axes=CONFIG["response_axes"]; minimum=float(CONFIG["acceptance"]["minimum_pairwise_response_distance"])
    for kind in ("isolated_kick","sustained_bass","mid_swell","high_transient_burst","steady_broadband"):
        samples=run(kind)
        representative=max(samples,key=lambda row:row["activity"]) if "transient" in kind or kind=="isolated_kick" else samples[-1]
        responses={name:module.vibe_response(representative,CONFIG["vibes"][name]) for name in MANUAL}
        for index,left in enumerate(MANUAL):
            for right in MANUAL[index+1:]:
                distance=module.response_distance(responses[left],responses[right],axes)
                check(distance>=minimum,f"{kind}: {left}/{right} distance {distance:.4f} < {minimum}")

    kick_features=max(run("isolated_kick"),key=lambda row:row["low_transient"])
    response={name:module.vibe_response(kick_features,CONFIG["vibes"][name]) for name in MANUAL}
    check(response["HEAVY"]["structure"]>response["GROOVE"]["structure"]+0.15,"Heavy kick structure not distinct")
    check(response["GROOVE"]["flow"]>response["HEAVY"]["flow"]+0.15,"Groove kick flow not distinct")
    check(response["COSMIC"]["depth"]>response["HEAVY"]["depth"]+0.10,"Cosmic depth not distinct")
    check(response["PSYCHEDELIC"]["symmetry"]>response["GROOVE"]["symmetry"]+0.20,"Psychedelic symmetry not distinct")

    auto=module.AutoSelectorCandidate(CONFIG["auto"]["minimum_dwell_seconds"],CONFIG["auto"]["switch_margin"])
    heavy=max(run("isolated_kick"),key=lambda row:row["low_transient"])
    psychedelic=max(run("high_transient_burst"),key=lambda row:row["high_transient"]).copy()
    psychedelic["spectral_change"]=1.0; psychedelic["mid_change"]=0.9
    observed=[auto.update(heavy if second%2==0 else psychedelic,1.0) for second in range(44)]
    check(len(set(observed))==1,"AUTO churned inside minimum dwell")

    print("PASS hbnf_vibe_audio_replay: 13 AudioFeatures semantics, six synthetic traces, pairwise Vibe differentiation, AUTO hysteresis")
    return 0

if __name__=="__main__":
    raise SystemExit(main())

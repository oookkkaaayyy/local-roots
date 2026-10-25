#!/usr/bin/env python3
from __future__ import annotations
import argparse, json

ORDER_CODES={"GRB":0,"RGB":1,"BRG":2,"RBG":3,"BGR":4,"GBR":5}
TYPE_DIGITAL_RGB=22

def build(pixels:int, order:str, reverse:bool, max_ma:int, led_ma:int):
    if not (1 <= pixels <= 2048):
        raise ValueError("logical pixel count must be 1..2048")
    if order not in ORDER_CODES:
        raise ValueError("unsupported color order")
    if not (250 <= max_ma <= 20000):
        raise ValueError("initial current limit must be 250..20000 mA")
    if not (1 <= led_ma <= 100):
        raise ValueError("mA per logical pixel must be 1..100")
    cfg={"def":{"ps":0,"on":False,"bri":64},"hw":{"led":{"total":pixels,"maxpwr":max_ma,"ins":[
        {"pin":[16],"start":0,"len":pixels,"type":TYPE_DIGITAL_RGB,"order":ORDER_CODES[order],"rev":reverse,"skip":0,"ref":False,"ledma":led_ma,"maxpwr":max_ma,"drv":0}
    ]}}}
    state={"mainseg":0,"seg":[
        {"id":0,"start":0,"stop":pixels,"on":True,"sel":True}
    ]}
    return {
        "mutationIssued":False,
        "reviewRequired":True,
        "topology":"underglow-only-v1",
        "sourceAuthority":{
            "wledBase":"29b389df1c1aaec6ff53aea742d17063b985906c",
            "schema":"wled00/cfg.cpp",
            "digitalType":TYPE_DIGITAL_RGB,
            "colorOrderCode":ORDER_CODES[order]
        },
        "inputs":{
            "underglowLogicalPixels":pixels,
            "colorOrder":order,
            "reverse":reverse,
            "underglowMaxMilliamps":max_ma,
            "milliampsPerLogicalPixel":led_ma
        },
        "cfgPatch":cfg,
        "statePatch":state,
        "postApplyChecks":{
            "totalLogicalLength":pixels,
            "underglow":{"gpio":16,"start":0,"stop":pixels,"selected":True},
            "uv":{"status":"UNVERIFIED_PER_CHANNEL_PENDING","voltageBasis":"owner-reported iNextStation 5V USB-A strips; not independently measured","mainNominalVoltageV":5,"shortNominalVoltageV":5,"sp803ePwmConfigured":False,"mustRemainDisconnected":True},
            "spareGpios":[25,26,27],
            "doNotReceiveSegmentOptionsOrBounds":True,
            "doNotInferColorOrder":True,
            "rebootExpectedAfterHardwareBusChange":True,
            "safeBoot":{"temporaryPreset":0,"finalReservedPresetRange":[180,199],"on":False,"brightness":64,"persistSegments":True}
        }
    }

def selftest():
    p=build(37,"RGB",False,900,55)
    ins=p["cfgPatch"]["hw"]["led"]["ins"]
    assert p["mutationIssued"] is False and p["reviewRequired"] is True
    assert p["topology"]=="underglow-only-v1"
    assert p["cfgPatch"]["hw"]["led"]["total"]==37
    assert p["cfgPatch"]["def"]=={"ps":0,"on":False,"bri":64}
    assert len(ins)==1
    assert ins[0]["pin"]==[16] and ins[0]["type"]==22 and ins[0]["len"]==37 and ins[0]["maxpwr"]==900
    seg=p["statePatch"]["seg"]
    assert len(seg)==1 and seg[0]["stop"]==37 and seg[0]["sel"] is True
    assert p["postApplyChecks"]["uv"]["sp803ePwmConfigured"] is False
    assert p["postApplyChecks"]["uv"]["mainNominalVoltageV"] == 5
    assert p["postApplyChecks"]["uv"]["shortNominalVoltageV"] == 5
    assert p["postApplyChecks"]["uv"]["mustRemainDisconnected"] is True
    for bad in (0,2049):
        try:
            build(bad,"RGB",False,900,55)
            raise AssertionError("bad pixel count accepted")
        except ValueError:
            pass
    print("HBNF_AUX_HARDWARE_PLAN_SELFTEST_PASS")

def main():
    ap=argparse.ArgumentParser(description="Generate, but DO NOT APPLY, HBNF Aux underglow-only WLED hardware/segment plan")
    ap.add_argument("--pixels",type=int)
    ap.add_argument("--order",choices=list(ORDER_CODES),help="Must be established from the real strip; do not guess")
    ap.add_argument("--reverse",action="store_true")
    ap.add_argument("--max-ma",type=int,default=900)
    ap.add_argument("--led-ma",type=int,default=55)
    ap.add_argument("--selftest",action="store_true")
    ap.add_argument("--out")
    a=ap.parse_args()
    if a.selftest:
        selftest()
        return 0
    if a.pixels is None or a.order is None:
        ap.error("--pixels and --order are required unless --selftest is used")
    plan=build(a.pixels,a.order,a.reverse,a.max_ma,a.led_ma)
    s=json.dumps(plan,indent=2,sort_keys=True)+"\n"
    if a.out:
        open(a.out,"w").write(s)
    print(s,end="")
    return 0

if __name__=="__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import argparse, json

ORDER_CODES={"GRB":0,"RGB":1,"BRG":2,"RBG":3,"BGR":4,"GBR":5}
TYPE_DIGITAL_RGB=22
TYPE_ANALOG_1CH=41

def build(pixels:int, order:str, reverse:bool, max_ma:int, led_ma:int):
    if not (1 <= pixels <= 2048):
        raise ValueError("logical pixel count must be 1..2048")
    if order not in ORDER_CODES:
        raise ValueError("unsupported color order")
    if not (250 <= max_ma <= 20000):
        raise ValueError("initial current limit must be 250..20000 mA")
    if not (1 <= led_ma <= 100):
        raise ValueError("mA per logical pixel must be 1..100")
    uv_main_start=pixels
    uv_short_start=pixels+1
    total=pixels+2
    cfg={"hw":{"led":{"total":total,"maxpwr":max_ma,"ins":[
        {"pin":[16],"start":0,"len":pixels,"type":TYPE_DIGITAL_RGB,"order":ORDER_CODES[order],"rev":reverse,"skip":0,"ref":False,"ledma":led_ma,"maxpwr":max_ma,"drv":0},
        {"pin":[25],"start":uv_main_start,"len":1,"type":TYPE_ANALOG_1CH,"order":0,"rev":False,"skip":0,"ref":False,"freq":9765,"ledma":0,"maxpwr":0,"drv":0},
        {"pin":[26],"start":uv_short_start,"len":1,"type":TYPE_ANALOG_1CH,"order":0,"rev":False,"skip":0,"ref":False,"freq":9765,"ledma":0,"maxpwr":0,"drv":0}
    ]}}}
    state={"mainseg":0,"seg":[
        {"id":0,"start":0,"stop":pixels,"on":True,"sel":True},
        {"id":1,"start":uv_main_start,"stop":uv_main_start+1,"on":False,"sel":False},
        {"id":2,"start":uv_short_start,"stop":uv_short_start+1,"on":False,"sel":False}
    ]}
    return {
        "mutationIssued":False,
        "reviewRequired":True,
        "sourceAuthority":{
            "wledBase":"29b389df1c1aaec6ff53aea742d17063b985906c",
            "schema":"wled00/cfg.cpp",
            "digitalType":TYPE_DIGITAL_RGB,
            "analog1chType":TYPE_ANALOG_1CH,
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
            "totalLogicalLength":total,
            "underglow":{"gpio":16,"start":0,"stop":pixels,"selected":True},
            "uvMain":{"gpio":25,"start":uv_main_start,"stop":uv_main_start+1,"selected":False,"mustStartOff":True},
            "uvShort":{"gpio":26,"start":uv_short_start,"stop":uv_short_start+1,"selected":False,"mustStartOff":True},
            "spareGpio":27,
            "doNotReceiveSegmentOptionsOrBounds":True,
            "doNotInferColorOrder":True,
            "rebootExpectedAfterHardwareBusChange":True
        }
    }

def selftest():
    p=build(37,"RGB",False,900,55)
    ins=p["cfgPatch"]["hw"]["led"]["ins"]
    assert p["mutationIssued"] is False and p["reviewRequired"] is True
    assert p["cfgPatch"]["hw"]["led"]["total"]==39
    assert ins[0]["pin"]==[16] and ins[0]["type"]==22 and ins[0]["len"]==37 and ins[0]["maxpwr"]==900
    assert ins[1]["pin"]==[25] and ins[1]["type"]==41 and ins[1]["start"]==37
    assert ins[2]["pin"]==[26] and ins[2]["type"]==41 and ins[2]["start"]==38
    seg=p["statePatch"]["seg"]
    assert seg[0]["stop"]==37 and seg[0]["sel"] is True
    assert seg[1]["start"]==37 and seg[1]["sel"] is False and seg[1]["on"] is False
    assert seg[2]["start"]==38 and seg[2]["sel"] is False and seg[2]["on"] is False
    for bad in (0,2049):
        try:
            build(bad,"RGB",False,900,55)
            raise AssertionError("bad pixel count accepted")
        except ValueError:
            pass
    print("HBNF_AUX_HARDWARE_PLAN_SELFTEST_PASS")

def main():
    ap=argparse.ArgumentParser(description="Generate, but DO NOT APPLY, HBNF Aux WLED hardware/segment plan")
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

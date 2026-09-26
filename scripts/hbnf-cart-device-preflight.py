#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, sys, time, urllib.request
from pathlib import Path

AUX_MAC = "8c94df55c34c"

def norm_mac(v):
    return ''.join(ch for ch in str(v or '').lower() if ch in '0123456789abcdef')

def led_count(info):
    try: return int(info['leds']['count'])
    except Exception: return None

def validate_matrix(info, state):
    errors=[]
    if led_count(info) != 512: errors.append(f"matrix_led_count={led_count(info)!r}, expected 512")
    if not isinstance(state, dict) or 'on' not in state or 'bri' not in state: errors.append('matrix_state_missing_on_or_bri')
    if norm_mac(info.get('mac')) == AUX_MAC: errors.append('matrix_mac_matches_known_aux')
    return errors

def validate_aux(info, state, expected_count=22):
    errors=[]
    mac=norm_mac(info.get('mac'))
    if mac != AUX_MAC: errors.append(f"aux_mac={mac or 'missing'}, expected {AUX_MAC}")
    if led_count(info) == 512: errors.append('aux_is_512_pixel_matrix_identity')
    if expected_count is not None and led_count(info) != expected_count:
        errors.append(f"aux_led_count={led_count(info)!r}, expected {expected_count}")
    if not isinstance(state, dict) or 'on' not in state or 'bri' not in state: errors.append('aux_state_missing_on_or_bri')
    return errors

def get_json(url, timeout=1.5):
    req=urllib.request.Request(url, headers={'User-Agent':'HBNF-readonly-preflight/1'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if r.status != 200: raise RuntimeError(f"HTTP {r.status} {url}")
        return json.loads(r.read().decode('utf-8'))

def probe_device(ip, timeout):
    base=f"http://{ip}"
    return {
        'ip':ip,
        'info':get_json(base+'/json/info', timeout),
        'state':get_json(base+'/json/state', timeout),
        'presets':get_json(base+'/presets.json', timeout),
    }

def selftest():
    matrix={'leds':{'count':512},'mac':'aabbccddeeff'}
    aux={'leds':{'count':22},'mac':'8c:94:df:55:c3:4c'}
    state={'on':True,'bri':8}
    assert validate_matrix(matrix,state)==[]
    assert validate_aux(aux,state)==[]
    assert 'aux_is_512_pixel_matrix_identity' in validate_aux(matrix,state,expected_count=512)
    assert any(x.startswith('aux_mac=') for x in validate_aux({'leds':{'count':22},'mac':'001122334455'},state))
    assert any(x.startswith('matrix_led_count=') for x in validate_matrix({'leds':{'count':22},'mac':'aabb'},state))
    print('HBNF_DEVICE_PREFLIGHT_SELFTEST=PASS')

def main():
    ap=argparse.ArgumentParser(description='Read-only direct-IP HBNF Matrix/AUX preflight. No POST/PUT requests are issued.')
    ap.add_argument('--matrix-ip',default='192.168.8.20')
    ap.add_argument('--aux-ip',default='192.168.8.21')
    ap.add_argument('--aux-count',type=int,default=22)
    ap.add_argument('--timeout',type=float,default=1.5)
    ap.add_argument('--out-dir',default=None)
    ap.add_argument('--selftest',action='store_true')
    a=ap.parse_args()
    if a.selftest: selftest(); return 0
    if a.matrix_ip == a.aux_ip:
        print('FAIL: matrix and AUX IPs are identical',file=sys.stderr); return 2
    stamp=time.strftime('%Y%m%d-%H%M%S')
    out=Path(a.out_dir or f'HBNF_CART_PREFLIGHT_{stamp}')
    out.mkdir(parents=True,exist_ok=False)
    report={'readonly':True,'timestamp':stamp,'matrixIp':a.matrix_ip,'auxIp':a.aux_ip,'checks':{}}
    try:
        m=probe_device(a.matrix_ip,a.timeout); x=probe_device(a.aux_ip,a.timeout)
    except Exception as e:
        report['ok']=False; report['error']=str(e)
        (out/'REPORT.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f'FAIL: {e}\nREPORT={out/"REPORT.json"}',file=sys.stderr); return 3
    for name,payload in [('MATRIX',m),('AUX',x)]:
        safe={'ip':payload['ip'],'info':payload['info'],'state':payload['state'],'presets':payload['presets']}
        (out/f'{name}_READONLY.json').write_text(json.dumps(safe,indent=2,sort_keys=True)+'\n')
    me=validate_matrix(m['info'],m['state']); ae=validate_aux(x['info'],x['state'],a.aux_count)
    report['checks']['matrix']={'ok':not me,'errors':me,'ledCount':led_count(m['info']),'mac':norm_mac(m['info'].get('mac')),'brightness':m['state'].get('bri'),'on':m['state'].get('on')}
    report['checks']['aux']={'ok':not ae,'errors':ae,'ledCount':led_count(x['info']),'mac':norm_mac(x['info'].get('mac')),'brightness':x['state'].get('bri'),'on':x['state'].get('on')}
    report['ok']=not me and not ae
    (out/'REPORT.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
    print(('PASS' if report['ok'] else 'FAIL')+f': HBNF direct-IP identity preflight; REPORT={out/"REPORT.json"}')
    return 0 if report['ok'] else 4

if __name__=='__main__': raise SystemExit(main())

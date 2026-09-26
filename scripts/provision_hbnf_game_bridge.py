#!/usr/bin/env python3
from __future__ import annotations
import getpass, os, re, sys, time\nfrom pathlib import Path

try:
    import serial
    import segno
except Exception as e:
    raise SystemExit(f"bridge provisioning dependency unavailable: {e}")

def read_until(ser, needles, seconds):
    end=time.time()+seconds
    seen=[]
    while time.time()<end:
        raw=ser.readline()
        if not raw:
            continue
        line=raw.decode("utf-8","replace").strip()
        if not line:
            continue
        seen.append(line)
        print(line)
        for needle in needles:
            if needle in line:
                return needle, seen
    return None, seen

def send(ser, text):
    ser.write((text+"\n").encode("utf-8"))
    ser.flush()


def parse_play_info(lines):
    for line in reversed(lines):
        if line.startswith("HBNF_PLAY_INFO "):
            m=re.search(r"SSID=([^ ]+) PASS=([^ ]+) URL=([^ ]+)",line)
            if m:
                return m.group(1),m.group(2),m.group(3)
    return None

def write_qr_pack(ssid,password,url):
    out=Path.home()/"Desktop"/"HBNF_PLAY_QR"
    out.mkdir(parents=True,exist_ok=True)
    wifi_payload=f"WIFI:T:WPA;S:{ssid};P:{password};;"
    segno.make(wifi_payload).save(out/"HBNF_PLAY_WIFI.svg",scale=8,border=2)
    segno.make(url).save(out/"HBNF_PLAY_CONTROLLER.svg",scale=8,border=2)
    html=f"""<!doctype html><meta charset="utf-8"><title>HBNF Play QR</title>
<style>body{{font:20px system-ui;text-align:center}}.q{{display:inline-block;margin:25px}}img{{width:300px}}small{{display:block}}</style>
<h1>HBNF PLAY</h1>
<div class="q"><h2>1. JOIN WIFI</h2><img src="HBNF_PLAY_WIFI.svg"><small>{ssid}</small></div>
<div class="q"><h2>2. OPEN CONTROLLER</h2><img src="HBNF_PLAY_CONTROLLER.svg"><small>{url}</small></div>
<p>The controller may open automatically after joining Wi-Fi.</p>"""
    (out/"PRINT_HBNF_PLAY.html").write_text(html)
    return out

def main():
    if len(sys.argv)!=2:
        raise SystemExit("usage: provision_hbnf_game_bridge.py <serial-port>")
    port=sys.argv[1]
    ssid=input("Cart SSID [HBNF-Cart]: ").strip() or "HBNF-Cart"
    password=getpass.getpass("Cart Wi-Fi password (stored only in ESP32 NVS): ")
    if not password:
        raise SystemExit("Password cannot be blank.")
    with serial.Serial(port,115200,timeout=.35) as ser:
        ser.dtr=False; ser.rts=False
        time.sleep(2.0)
        ser.reset_input_buffer()
        send(ser,f"WIFI_SSID {ssid}")
        time.sleep(.15)
        send(ser,f"WIFI_PASS {password}")
        password=""  # release the Python reference immediately
        time.sleep(.15)
        send(ser,"WIFI_CONNECT")
        hit,_=read_until(ser,["HBNF_WIFI=ONLINE"],15)
        if not hit:
            send(ser,"STATUS")
            read_until(ser,["HBNF_STATUS"],3)
            raise SystemExit("WIFI_PROVISION=FAIL: bridge did not report online.")

        send(ser,"PLAY_INFO")
        hit,play_lines=read_until(ser,["HBNF_PLAY_INFO"],4)
        info=parse_play_info(play_lines)
        if not hit or not info:
            raise SystemExit("PLAY_AP_INFO=FAIL: bridge did not return guest-play credentials.")
        play_ssid,play_pass,play_url=info
        qr_dir=write_qr_pack(play_ssid,play_pass,play_url)
        print(f"\nHBNF_PLAY_QR=PASS {qr_dir}")

        pair=(input("\nPair the Stadia controllers now? [Y/n]: ").strip().lower() or "y")
        if pair not in ("y","yes"):
            send(ser,"PAIR_LOCK")
            send(ser,"STATUS")
            read_until(ser,["HBNF_STATUS"],4)
            print("STADIA_PAIRING=SKIPPED")
            print("HBNF_GAME_BRIDGE_PROVISION=PASS")
            return 0

        print("\nCONTROLLER 1: hold Y + Stadia until it pairs.")
        send(ser,"PAIR_OPEN")
        hit,_=read_until(ser,["HBNF_PAD_CONNECTED=P1"],30)
        if not hit:
            print("CONTROLLER_1_PAIR=UNAVAILABLE: web/iPad game control remains available.")
        else:
            print("\nCONTROLLER 2: hold Y + Stadia until it pairs.")
            hit2,_=read_until(ser,["HBNF_PAD_CONNECTED=P2"],30)
            if not hit2:
                print("CONTROLLER_2_PAIR=UNAVAILABLE: P1/web/iPad controls remain available.")

        send(ser,"PAIR_LOCK")
        send(ser,"STATUS")
        hit,_=read_until(ser,["HBNF_STATUS"],4)
        if not hit:
            raise SystemExit("FINAL_STATUS=FAIL")
    print("HBNF_GAME_BRIDGE_PROVISION=PASS")
    return 0

if __name__=="__main__":
    raise SystemExit(main())

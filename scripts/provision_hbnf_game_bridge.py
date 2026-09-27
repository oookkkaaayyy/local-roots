#!/usr/bin/env python3
from __future__ import annotations
import getpass, os, re, sys, time
from pathlib import Path

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
    # Keep a URL QR only as a diagnostic fallback; the printable guest sign uses ONE QR.
    segno.make(url).save(out/"HBNF_PLAY_CONTROLLER_DIAGNOSTIC.svg",scale=8,border=2)
    html=f"""<!doctype html><meta charset="utf-8"><title>HBNF Cart QR</title>
<style>body{{font:22px system-ui;text-align:center;background:#071018;color:#fff}}img{{width:360px;background:#fff;padding:12px;border-radius:18px}}small{{display:block;color:#b9ced6;margin-top:12px}}</style>
<h1>SCAN TO CONTROL THE CART + PLAY</h1>
<img src="HBNF_PLAY_WIFI.svg">
<p>Scan with your camera → Join <b>{ssid}</b>.<br>The controller should open automatically.</p>
<small>If it does not open, visit {url}</small>"""
    (out/"PRINT_HBNF_PLAY.html").write_text(html)
    return out

def main():
    if len(sys.argv) not in (2,3):
        raise SystemExit("usage: provision_hbnf_game_bridge.py <serial-port> [cart-device-token-file]")
    port=sys.argv[1]
    token_file=Path(sys.argv[2]).expanduser() if len(sys.argv)==3 else None
    cart_token=""
    if token_file:
        if not token_file.is_file():
            raise SystemExit(f"CART_TOKEN_FILE_MISSING: {token_file}")
        cart_token=token_file.read_text().strip()
        if len(cart_token)<20:
            raise SystemExit("CART_TOKEN_INVALID")
    ssid=input("Cart SSID [HBNF-Cart]: ").strip() or "HBNF-Cart"
    password=getpass.getpass("Cart Wi-Fi password (stored only in ESP32 NVS): ")
    if not password:
        raise SystemExit("Password cannot be blank.")
    fallback_ssid=input("Fallback hotspot SSID [leave blank to skip]: ").strip()
    fallback_password=""
    if fallback_ssid:
        fallback_password=getpass.getpass("Fallback hotspot password (stored only in ESP32 NVS): ")
        if not fallback_password:
            raise SystemExit("Fallback password cannot be blank when fallback SSID is set.")
    with serial.Serial(port,115200,timeout=.35) as ser:
        ser.dtr=False; ser.rts=False
        time.sleep(2.0)
        ser.reset_input_buffer()
        send(ser,f"WIFI_SSID {ssid}")
        time.sleep(.15)
        send(ser,f"WIFI_PASS {password}")
        password=""  # release the Python reference immediately
        time.sleep(.15)
        if fallback_ssid:
            send(ser,f"FALLBACK_SSID {fallback_ssid}")
            time.sleep(.15)
            send(ser,f"FALLBACK_PASS {fallback_password}")
            fallback_password=""
            time.sleep(.15)
        else:
            send(ser,"CLEAR_FALLBACK")
            time.sleep(.15)
        send(ser,"WIFI_CONNECT")
        hit,wifi_lines=read_until(ser,["HBNF_WIFI=ONLINE"],18)
        if not hit:
            send(ser,"STATUS")
            read_until(ser,["HBNF_STATUS"],3)
            raise SystemExit("WIFI_PROVISION=FAIL: bridge did not report online.")
        if any("TARGET=FALLBACK" in line for line in wifi_lines):
            print("HBNF_WIFI_PRIMARY=UNAVAILABLE_FALLBACK_ACTIVE")
        else:
            print("HBNF_WIFI_PRIMARY=PASS")

        if cart_token:
            send(ser,"CART_TOKEN "+cart_token)
            cart_token=""
            hit,_=read_until(ser,["HBNF_CART_TOKEN_STORED=PASS"],4)
            if not hit:
                raise SystemExit("CART_PROXY_PROVISION=FAIL")
            print("HBNF_GUEST_CART_CONTROLS=PASS")
        else:
            print("HBNF_GUEST_CART_CONTROLS=NOT_PROVISIONED")

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

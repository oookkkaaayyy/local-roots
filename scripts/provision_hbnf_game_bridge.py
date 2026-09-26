#!/usr/bin/env python3
from __future__ import annotations
import getpass, sys, time

try:
    import serial
except Exception as e:
    raise SystemExit(f"pyserial unavailable: {e}")

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

        print("\nCONTROLLER 1: hold Y + Stadia until it pairs.")
        send(ser,"PAIR_OPEN")
        hit,_=read_until(ser,["HBNF_PAD_CONNECTED=P1"],45)
        if not hit:
            raise SystemExit("CONTROLLER_1_PAIR=FAIL: wireless game setup stopped; normal cart is unaffected.")

        print("\nCONTROLLER 2: hold Y + Stadia until it pairs.")
        hit,_=read_until(ser,["HBNF_PAD_CONNECTED=P2"],45)
        if not hit:
            raise SystemExit("CONTROLLER_2_PAIR=FAIL: one-controller identity is preserved; normal cart is unaffected.")

        send(ser,"PAIR_LOCK")
        send(ser,"STATUS")
        hit,_=read_until(ser,["HBNF_STATUS"],4)
        if not hit:
            raise SystemExit("FINAL_STATUS=FAIL")
    print("HBNF_GAME_BRIDGE_PROVISION=PASS")
    return 0

if __name__=="__main__":
    raise SystemExit(main())

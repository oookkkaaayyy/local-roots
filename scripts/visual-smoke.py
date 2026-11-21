#!/usr/bin/env python3
"""Overflow smoke test: loads each public route at three widths and fails on horizontal overflow.
Usage: python3 scripts/visual-smoke.py [base_url]   (needs playwright + chrome)"""
import sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://localrootsdg.com"
ROUTES = ["/events", "/weather", "/submit-event", "/hb-night-flyers", "/dyed-and-unattached",
          "/dyed-and-unattached/stencil", "/dyed-and-unattached/dye-studio"]
SIZES = [(1366, 1024), (834, 1112), (390, 844)]
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for w, h in SIZES:
        pg = b.new_page(viewport={"width": w, "height": h})
        for r in ROUTES:
            pg.goto(BASE + r, wait_until="networkidle")
            pg.wait_for_timeout(500)
            sw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            ok = sw[0] <= sw[1]
            bad += 0 if ok else 1
            print(("ok  " if ok else "FAIL"), w, r, sw)
        pg.close()
    b.close()
sys.exit(1 if bad else 0)

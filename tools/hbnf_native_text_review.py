#!/usr/bin/env python3
"""Render a compact owner-review SVG from the exact pinned WLED WBF fonts.

No hardware, network, or product mutation. The logical 32x16 pixel previews
use the actual built-in font bitmaps and are explicitly a design checkpoint.
"""
from __future__ import annotations
import argparse, hashlib, html, re
from pathlib import Path

CASES = [
    ("HERO WORD", "ACE", "5x12", "centered; 2.2 s hold"),
    ("NAME", "ANDREW", "5x12", "oversize word; short marquee after phrase paging"),
    ("NUMBER / VALUE", "$187", "5x12", "centered; 2.2 s hold"),
    ("DIRECTIVE", "GO", "5x12", "centered; 2.2 s hold"),
    ("SHORT ANNOUNCEMENT", "ACE POT", "5x12", "page-fit before any marquee"),
    ("MULTI-PAGE PHRASE", "NEXT PLAYER UP", "5x12", "NEXT → PLAYER → UP; 2.2 s/page"),
]

def font_data(path: Path, symbol: str):
    source=path.read_text()
    match=re.search(r"static const unsigned char\s+"+re.escape(symbol)+r"\[\]\s+PROGMEM\s*=\s*\{(.*?)\};",source,re.S)
    if not match: raise ValueError(f"font array {symbol} missing in {path}")
    body=re.sub(r"/\*.*?\*/|//[^\n]*", "", match.group(1), flags=re.S)
    data=bytes(int(x,16) for x in re.findall(r"0x([\da-fA-F]{1,2})",body))
    if len(data)<12 or data[0]!=0x57: raise ValueError("invalid WBF font header")
    height,width,spacing,flags,first,last=data[1:7]
    count=last-first+1
    widths=list(data[12:12+count]) if flags&1 else [width]*count
    bitmap=data[12+count:] if flags&1 else data[12:]
    return {"height":height,"width":width,"spacing":spacing,"first":first,"last":last,"widths":widths,"bitmap":bitmap,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}

def glyph(font, char):
    code=ord(char)
    if code<font["first"] or code>font["last"]: code=ord('?')
    idx=code-font["first"]; w=font["widths"][idx]; h=font["height"]
    offset=sum((font["widths"][i]*h+7)//8 for i in range(idx))
    raw=font["bitmap"][offset:offset+(w*h+7)//8]
    return [[bool(raw[(y*w+x)//8] & (1 << (7-((y*w+x)%8)))) for x in range(w)] for y in range(h)],w

def draw(text,font):
    rows=[[False]*32 for _ in range(16)]
    widths=[glyph(font,c)[1] for c in text]
    total=sum(widths)+font["spacing"]*max(0,len(text)-1)
    x=max(0,(32-total)//2); y=max(0,(16-font["height"])//2)
    for c,w in zip(text,widths):
        bitmap,_=glyph(font,c)
        for gy,row in enumerate(bitmap):
            for gx,on in enumerate(row):
                if on and y+gy<16 and x+gx<32: rows[y+gy][x+gx]=True
        x+=w+font["spacing"]
    return rows,total

def pages_for(text,font):
    pages=[]; current=""
    for word in text.upper().split():
        candidate=word if not current else current+" "+word
        if current and draw(candidate,font)[1]>32:
            pages.append(current); current=word
        else: current=candidate
    if current: pages.append(current)
    return pages or [""]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--wled",type=Path,default=Path("/private/tmp/hbnf-seq39-build/wled"))
    ap.add_argument("--out",type=Path,default=Path("evidence/hbnf-phase2-integration-20261006/TEXT_OWNER_REVIEW_R1.svg"))
    a=ap.parse_args()
    root=a.wled/"wled00/src/font"
    f5=font_data(root/"font_5x12.h","font_5x12")
    f6=font_data(root/"console_font_6x8.h","console_font_6x8")
    # Show all six proposed moments twice to compare the two native WLED faces.
    cards=[]; card_w=355; card_h=172; gap=16; margin=24
    for i,(name,text,_,hold) in enumerate(CASES):
        for row,(font,label) in enumerate(((f5,"WLED native 5x12"),(f6,"WLED native 6x8"))):
            x=margin+(i%3)*(card_w+gap); y=margin+(i//3)*(card_h*2+gap*2)+row*(card_h+gap)
            pages=pages_for(text,font); shown=pages[0]
            rows,pixel_width=draw(shown,font)
            pages_label=" → ".join(pages)
            dots=[]
            px=5; ox=x+18; oy=y+45
            for ry,line in enumerate(rows):
                for rx,on in enumerate(line):
                    if on: dots.append(f'<rect x="{ox+rx*px}" y="{oy+ry*px}" width="4" height="4" rx="1" fill="#d9f3ff"/>')
            dots_svg="".join(dots)
            cards.append(f'<g><rect x="{x}" y="{y}" width="{card_w}" height="{card_h}" rx="14" fill="#101b2b" stroke="#38506b"/><text x="{x+16}" y="{y+23}" class="title">{html.escape(name)} · {label}</text><text x="{x+16}" y="{y+39}" class="sub">Page 1/{len(pages)}: {html.escape(shown)} · {pixel_width}px · {html.escape(hold)}</text><rect x="{ox-5}" y="{oy-5}" width="170" height="90" rx="8" fill="#05090f" stroke="#263b51"/>{dots_svg}<text x="{x+200}" y="{y+76}" class="sub">32 × 16 logical pixels</text><text x="{x+200}" y="{y+96}" class="sub">pages: {html.escape(pages_label)}</text><text x="{x+200}" y="{y+116}" class="sub">centered; stable native glyphs</text></g>')
    width=3*card_w+2*gap+2*margin; height=2*(2*card_h+2*gap)+2*margin+60
    meta=f"Pinned WLED 16.0.1 · font_5x12 SHA256 {f5['sha256']} · console_font_6x8 SHA256 {f6['sha256']}"
    disclaimer="DESIGN REVIEW ONLY — proposed layout, logical pixel preview; not physical Matrix rendering or owner acceptance. Page dwell 2.2 s; phrase paging before marquee; entry/exit and final face remain open for owner review."
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><style>text{{font-family:system-ui,sans-serif}}.title{{font-size:14px;font-weight:700;fill:#f1f6ff}}.sub{{font-size:10px;fill:#a9bbcf}}</style><rect width="100%" height="100%" fill="#08111d"/><text x="{margin}" y="22" style="font:700 18px system-ui;fill:#fff">HBNF Text / VisualMoment — owner review R1</text>{''.join(cards)}<text x="{margin}" y="{height-31}" style="font:11px system-ui;fill:#c3d3e5">{html.escape(meta)}</text><text x="{margin}" y="{height-12}" style="font:10px system-ui;fill:#f3c777">{html.escape(disclaimer)}</text></svg>'''
    a.out.parent.mkdir(parents=True,exist_ok=True); a.out.write_text(svg)
    print(f"PASS {a.out} bytes={a.out.stat().st_size} fonts=WLED_NATIVE_5X12,WLED_NATIVE_6X8")

if __name__=="__main__": main()

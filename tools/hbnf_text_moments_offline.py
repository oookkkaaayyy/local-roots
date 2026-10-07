"""Offline-only HBNF premium text/moment planner.

Consumes candidate VisualMoment/VibeSelection mappings without defining or mutating
their shared interface. Produces deterministic render intent for host fixtures.
No network, hardware, WLED, OTA, or deployment code exists here.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import re
from typing import Any, Mapping

CLASS_LIMITS = {"HERO_WORD":7,"NAME":8,"NUMBER_VALUE":7,"DIRECTIVE":9,"SHORT_ANNOUNCEMENT":9,"LONG_FREE_TEXT":9}
VIBES = {"CHILL","GROOVE","HEAVY","PSYCHEDELIC","COSMIC","AUTO"}
# Widths from the pinned WLED 16.0.1 native font_5x12.h variable-width table
# (ASCII 32..126). This is layout metadata only; the firmware rasterizer uses
# WLED's built-in glyph bitmap and spacing.
NATIVE_5X12_WIDTHS = (2,1,3,5,5,5,5,1,3,3,5,5,3,5,2,5,5,5,5,5,5,5,5,5,5,5,2,3,5,5,5,5,5,5,5,5,5,5,5,5,5,3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3,5,3,5,5,2,5,5,5,5,5,5,5,5,3,4,5,3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1,5,5)
TEXT_WIDTH_PX = 32
GLYPH_SPACING_PX = 1

@dataclass(frozen=True)
class RenderIntent:
    moment_class: str
    pages: tuple[str, ...]
    vibe: str
    entry: str
    hold: str
    exit: str
    glyph_geometry_stable: bool = True
    audio_may_deform_glyphs: bool = False
    marquee_fallback: bool = False
    return_behavior: str = "RESTORE_BASE"
    font: str = "WLED_NATIVE_5X12"
    page_hold_ms: int = 2200
    oversized_word_marquee: bool = False

@dataclass(frozen=True)
class ReferenceFrame:
    """Tiny host oracle for the compositor boundary, not firmware rendering."""
    animation_tick: int
    pixels: tuple[tuple[int, int, int], ...]

def compose_reference(base: ReferenceFrame, glyph_mask: tuple[bool, ...] | None,
                      color: tuple[int, int, int]) -> ReferenceFrame:
    """Composite a supplied, already-shaped mask without owning scene state.

    The caller supplies the current canonical frame on every invocation. This
    helper deliberately owns neither a font nor an animation clock/cache.
    """
    if glyph_mask is None or not any(glyph_mask):
        return base
    if len(glyph_mask) != len(base.pixels):
        raise ValueError("glyph mask must match the base frame")
    pixels = tuple(color if glyph_mask[i] else px for i, px in enumerate(base.pixels))
    return ReferenceFrame(base.animation_tick, pixels)

def _text(moment: Mapping[str, Any]) -> str:
    for k in ("primary_text","text","value","secondary_text"):
        v=moment.get(k)
        if v is not None and str(v).strip():
            return re.sub(r"\s+"," ",str(v).strip()).upper()
    return ""

def classify(moment: Mapping[str, Any]) -> str:
    explicit=str(moment.get("class") or moment.get("type") or "").upper()
    aliases={"HERO":"HERO_WORD","HERO_WORD":"HERO_WORD","ACE":"HERO_WORD","WINNER":"HERO_WORD","NAME":"NAME","PLAYER_NAME":"NAME","TEAM_REVEAL":"NAME","NUMBER":"NUMBER_VALUE","VALUE":"NUMBER_VALUE","NUMBER_VALUE":"NUMBER_VALUE","TIMER":"NUMBER_VALUE","DISTANCE":"NUMBER_VALUE","ACE_POT":"NUMBER_VALUE","DIRECTIVE":"DIRECTIVE","SHORT_ANNOUNCEMENT":"SHORT_ANNOUNCEMENT","ANNOUNCEMENT":"SHORT_ANNOUNCEMENT","LONG_FREE_TEXT":"LONG_FREE_TEXT"}
    if explicit in aliases: return aliases[explicit]
    t=_text(moment)
    if re.fullmatch(r"(?:\$?\d+(?:\s?(?:FT|SEC))?|#\d+)",t): return "NUMBER_VALUE"
    if t in {"ACE","WINNER","SKINS","GLOW"}: return "HERO_WORD"
    return "SHORT_ANNOUNCEMENT" if len(t)<=18 else "LONG_FREE_TEXT"

def _width(text: str) -> int:
    if not text: return 0
    widths=[]
    for c in text:
        code=ord(c)
        widths.append(NATIVE_5X12_WIDTHS[code-32] if 32 <= code <= 126 else NATIVE_5X12_WIDTHS[ord('?')-32])
    return sum(widths) + GLYPH_SPACING_PX * max(0, len(widths)-1)

def _pack(words:list[str], limit:int)->tuple[tuple[str,...],bool]:
    pages=[]; cur=""
    oversized=False
    for w in words:
        if _width(w)>TEXT_WIDTH_PX:
            if cur: pages.append(cur); cur=""
            pages.append(w); oversized=True; continue
        nxt=w if not cur else f"{cur} {w}"
        if _width(nxt)<=TEXT_WIDTH_PX and len(nxt)<=limit: cur=nxt
        else: pages.append(cur); cur=w
    if cur: pages.append(cur)
    return tuple(pages or [""]),oversized

def plan(moment: Mapping[str, Any], vibe_selection: Mapping[str, Any]|None=None)->RenderIntent:
    cls=classify(moment); t=_text(moment)
    vibe=str((vibe_selection or {}).get("vibe") or (vibe_selection or {}).get("name") or "AUTO").upper()
    if vibe not in VIBES: vibe="AUTO"
    pages,oversized=_pack(t.split(),CLASS_LIMITS[cls])
    treatments={"CHILL":("SOFT_REVEAL","CALM_HALO","DISSOLVE"),"GROOVE":("RHYTHMIC_REVEAL","BOUNDED_HALO","PHASE_DISSOLVE"),"HEAVY":("CARVE_IN","EDGE_PRESSURE","IMPACT_DISSOLVE"),"PSYCHEDELIC":("FIELD_CONVERGE","COLOR_FIELD_HALO","FIELD_RELEASE"),"COSMIC":("STAR_REVEAL","DEPTH_HALO","STAR_DISSOLVE"),"AUTO":("VIBE_INHERIT","VIBE_INHERIT","VIBE_INHERIT")}
    entry,hold,exit=treatments[vibe]
    return RenderIntent(cls,pages,vibe,entry,hold,exit,marquee_fallback=oversized,return_behavior=str(moment.get("return_behavior") or "RESTORE_BASE"),oversized_word_marquee=oversized)

def to_dict(intent:RenderIntent)->dict[str,Any]:
    d=asdict(intent); d["pages"]=list(intent.pages); return d

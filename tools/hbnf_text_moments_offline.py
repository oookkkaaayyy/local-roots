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

def _pack(words:list[str], limit:int)->tuple[str,...]:
    pages=[]; cur=""
    for w in words:
        if len(w)>limit:
            if cur: pages.append(cur); cur=""
            pages.append(w); continue
        nxt=w if not cur else f"{cur} {w}"
        if len(nxt)<=limit: cur=nxt
        else: pages.append(cur); cur=w
    if cur: pages.append(cur)
    return tuple(pages or [""])

def plan(moment: Mapping[str, Any], vibe_selection: Mapping[str, Any]|None=None)->RenderIntent:
    cls=classify(moment); t=_text(moment)
    vibe=str((vibe_selection or {}).get("vibe") or (vibe_selection or {}).get("name") or "AUTO").upper()
    if vibe not in VIBES: vibe="AUTO"
    pages=_pack(t.split(),CLASS_LIMITS[cls])
    treatments={"CHILL":("SOFT_REVEAL","CALM_HALO","DISSOLVE"),"GROOVE":("RHYTHMIC_REVEAL","BOUNDED_HALO","PHASE_DISSOLVE"),"HEAVY":("CARVE_IN","EDGE_PRESSURE","IMPACT_DISSOLVE"),"PSYCHEDELIC":("FIELD_CONVERGE","COLOR_FIELD_HALO","FIELD_RELEASE"),"COSMIC":("STAR_REVEAL","DEPTH_HALO","STAR_DISSOLVE"),"AUTO":("VIBE_INHERIT","VIBE_INHERIT","VIBE_INHERIT")}
    entry,hold,exit=treatments[vibe]
    return RenderIntent(cls,pages,vibe,entry,hold,exit,marquee_fallback=False,return_behavior=str(moment.get("return_behavior") or "RESTORE_BASE"))

def to_dict(intent:RenderIntent)->dict[str,Any]:
    d=asdict(intent); d["pages"]=list(intent.pages); return d

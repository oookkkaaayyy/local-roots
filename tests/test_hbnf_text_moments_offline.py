import unittest
from tools.hbnf_text_moments_offline import plan, classify, ReferenceFrame, compose_reference

class TextMomentTests(unittest.TestCase):
    def test_acceptance_corpus(self):
        cases=[("HERO_WORD","ACE"),("HERO_WORD","WINNER"),("NAME","ANDREW"),("NAME","TEAM 4"),("NUMBER_VALUE","$187"),("NUMBER_VALUE","25 FT"),("NUMBER_VALUE","30 SEC"),("DIRECTIVE","STATION 4"),("DIRECTIVE","READY"),("DIRECTIVE","GO"),("DIRECTIVE","REST"),("SHORT_ANNOUNCEMENT","BACK 9"),("SHORT_ANNOUNCEMENT","ACE POT"),("SHORT_ANNOUNCEMENT","NEXT UP"),("LONG_FREE_TEXT","SOURCE DEPENDENT LONG MESSAGE FIXTURE")]
        for cls,text in cases:
            p=plan({"class":cls,"primary_text":text},{"vibe":"HEAVY"})
            self.assertEqual(p.moment_class,cls); self.assertFalse(p.audio_may_deform_glyphs); self.assertTrue(p.glyph_geometry_stable); self.assertFalse(p.marquee_fallback); self.assertTrue(p.pages)
    def test_candidate_visualmoment_keys_without_new_schema(self):
        self.assertEqual(plan({"type":"ACE","primary_text":"ACE","duration":2000,"urgency":"high","allow_audio_accent":True,"return_behavior":"RESTORE_BASE"},{"name":"COSMIC"}).moment_class,"HERO_WORD")
    def test_phrase_paging_precedes_scroll(self):
        p=plan({"class":"SHORT_ANNOUNCEMENT","primary_text":"NEXT PLAYER UP"},{"vibe":"CHILL"}); self.assertGreater(len(p.pages),1); self.assertFalse(p.marquee_fallback)
    def test_vibe_changes_treatment_not_text_geometry(self):
        a=plan({"class":"HERO_WORD","primary_text":"ACE"},{"vibe":"CHILL"}); b=plan({"class":"HERO_WORD","primary_text":"ACE"},{"vibe":"HEAVY"}); self.assertEqual(a.pages,b.pages); self.assertNotEqual(a.entry,b.entry); self.assertTrue(a.glyph_geometry_stable and b.glyph_geometry_stable)
    def test_unknown_vibe_fails_to_auto_inherit(self):
        self.assertEqual(plan({"primary_text":"ACE"},{"vibe":"UNFROZEN_NEW_VIBE"}).vibe,"AUTO")
    def test_value_inference(self):
        self.assertEqual(classify({"primary_text":"25 FT"}),"NUMBER_VALUE"); self.assertEqual(classify({"primary_text":"ACE"}),"HERO_WORD")
    def test_empty_is_deterministic(self):
        p=plan({},{}); self.assertEqual(p.pages,("",)); self.assertEqual(p.vibe,"AUTO")
    def test_text_compositor_does_not_own_or_advance_animation_clock(self):
        base=ReferenceFrame(120,( (1,2,3), )*512)
        masked=compose_reference(base,tuple(i==0 for i in range(512)),(9,8,7))
        self.assertEqual(masked.animation_tick,base.animation_tick)
        self.assertEqual(base.pixels[0],(1,2,3))
        self.assertEqual(masked.pixels[1:],base.pixels[1:])
    def test_moment_exit_returns_exact_current_base_without_state_leak(self):
        first=ReferenceFrame(120,((1,2,3),)*512)
        during=compose_reference(first,tuple(i==7 for i in range(512)),(9,8,7))
        self.assertNotEqual(during.pixels,first.pixels)
        current_base=ReferenceFrame(121,((4,5,6),)*512)
        after=compose_reference(current_base,None,(9,8,7))
        self.assertIs(after,current_base)
        self.assertEqual(after, current_base)
    def test_no_text_fast_path_is_constant_reference_return(self):
        # The inactive path must not walk, copy, or modify the 512-pixel frame.
        base=ReferenceFrame(9,((3,4,5),)*512)
        self.assertIs(compose_reference(base,None,(255,255,255)),base)
if __name__=="__main__": unittest.main()

import pathlib
import hashlib
import json
import shutil
import sys
import subprocess
import tempfile
import unittest

# Make the repository's namespace-package tools importable when this test is
# launched by an external runner whose working directory is not the repo root.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from tools.hbnf_text_moments_offline import plan, classify, ReferenceFrame, compose_reference

class TextMomentTests(unittest.TestCase):
    def test_treatment_review_records_provisional_runtime_without_freezing_aesthetics(self):
        root=pathlib.Path(__file__).resolve().parents[1]
        decision=json.loads((root/"firmware/phase2/integration-r5/ENGINEERING_DECISION.json").read_text())
        review=decision["evidence"]["scoped_evidence"]["text_treatment_capability_review"]
        self.assertEqual(review["status"],"NATIVE_FONTMANAGER_RUNTIME_IMPLEMENTED__AESTHETICS_UNFROZEN__TARGET_QUALIFICATION_PENDING")
        options={item["id"]:item for item in review["review_options"]}
        self.assertEqual(set(options),{"quiet_reveal","vibe_contour","soft_dissolve"})
        self.assertEqual(options["quiet_reveal"]["state"],"IMPLEMENTED_PROVISIONAL_DEFAULT")
        self.assertIn("not a literal outline/contour",options["vibe_contour"]["concept"])
        self.assertEqual(options["vibe_contour"]["state"],"IMPLEMENTED_PROVISIONAL_VIBE_MAPPING_UNFROZEN")
        self.assertEqual(options["soft_dissolve"]["state"],"IMPLEMENTED_PROVISIONAL_BLEND_PATH__TARGET_COST_QUALIFICATION_PENDING")
        self.assertIn("blendPixelColorXY",options["soft_dissolve"]["compatibility"])
        self.assertEqual(review["acceptance_boundary"].split("; ")[0],"Runtime implementation is present with reversible defaults")
        binding=json.loads((root/"firmware/phase2/integration-r5/SOURCE_BINDING.json").read_text())
        self.assertTrue(binding["firmware_built"])
        self.assertEqual(binding["release_identity"],"hbnf-cart2-phase2-offline-wow-r5-20261008")
        self.assertEqual(binding["schema"],"hbnf-phase2-integration-r5-source-binding-v3")
        self.assertEqual(binding["complete_runtime_source_closure"]["total_bytes"],535877)

    def test_native_font_index_patch_defaults_and_falls_back_to_slot_four(self):
        root=pathlib.Path(__file__).resolve().parents[1]
        patch=(root/"firmware/phase2/integration-r5/native-font-index.patch").read_text()
        binding=json.loads((root/"firmware/phase2/integration-r5/SOURCE_BINDING.json").read_text())
        pinned=root.parent/"WLED-v16.0.1"
        font_manager=(pinned/"wled00/fontmanager.cpp").read_text()
        self.assertIn('const int requestedFontIndex=obj["fontIndex"]|4;',patch)
        self.assertIn('requestedFontIndex==0||requestedFontIndex==2||requestedFontIndex==3||requestedFontIndex==4',patch)
        self.assertIn('bool fontLoaded=font.loadFont(overlay.fontIndex,overlay.text,false);',patch)
        self.assertIn('if(!fontLoaded&&overlay.fontIndex!=4)fontLoaded=font.loadFont(4,overlay.text,false);',patch)
        self.assertIn('if(fontLoaded)HbnfNativeText::drawPaged',patch)
        self.assertIn('s.fontIndex=fontIndex;',patch)
        for marker in ('case 0: flashFont = font_tom_thumb_6px','case 1: flashFont = font_TinyUnicode_8px','case 2: flashFont = console_font_6x8','case 3: flashFont = c64esque_9px','case 4: flashFont = font_5x12'):
            self.assertIn(marker,font_manager)
        font=pinned/"wled00/src/font/font_5x12.wbf"
        self.assertEqual(hashlib.sha256(font.read_bytes()).hexdigest(),"e98ecd3cb8b6a135a0b318e51ebd08eb61fa6b718e2d1ffca2d4d863bb7c0581")
        self.assertTrue(binding["status"].startswith("R5_"))
        self.assertTrue(binding["r4_preserved_byte_for_byte"])
        self.assertEqual(hashlib.sha256((root/"firmware/phase2/integration-r4/usermod_hbnf_foundation_v1.patch").read_bytes()).hexdigest(),binding["r4_patch_sha256"])
        self.assertEqual(hashlib.sha256((root/"firmware/phase2/integration-r5/native-font-index.patch").read_bytes()).hexdigest(),binding["patch_sha256"])

    def test_native_font_index_patch_applies_to_exact_reconstructed_r4_source(self):
        root=pathlib.Path(__file__).resolve().parents[1]
        binding=json.loads((root/"firmware/phase2/integration-r5/SOURCE_BINDING.json").read_text())
        pinned=root.parent/"WLED-v16.0.1"
        with tempfile.TemporaryDirectory(prefix="hbnf-r5-font-") as td:
            temp=pathlib.Path(td)
            target=temp/"usermods/hbnf_foundation_v1"
            target.mkdir(parents=True)
            shutil.copy2(root/"firmware/packet20/seq39-tail250/usermod_hbnf_foundation_v1.cpp",target/"usermod_hbnf_foundation_v1.cpp")
            # Recover the exact pre-font-index contract from the preserved
            # final R5 source by reversing the pinned R5 patch's three edits.
            # The pinned WLED source tree is restored from its existing git
            # objects in the clean-room build workspace; it is not a second
            # authority for this exact test input.
            contract=(root/"firmware/phase2/integration-r5/usermod/hbnf_coordinated_contract.h").read_text()
            contract=contract.replace("  uint8_t fontIndex=4;\n", "")
            contract=contract.replace("uint8_t r,uint8_t g,uint8_t b,uint32_t now,uint8_t fontIndex=4)", "uint8_t r,uint8_t g,uint8_t b,uint32_t now)")
            contract=contract.replace("s.r=r;s.g=g;s.b=b;s.fontIndex=fontIndex;", "s.r=r;s.g=g;s.b=b;")
            (target/"hbnf_coordinated_contract.h").write_text(contract)
            r4_patch=root/"firmware/phase2/integration-r4/usermod_hbnf_foundation_v1.patch"
            subprocess.run(["patch","--batch","--forward","-p1","-i",str(r4_patch)],cwd=target,check=True,capture_output=True,text=True)
            usermod=target/"usermod_hbnf_foundation_v1.cpp"
            self.assertEqual(hashlib.sha256(usermod.read_bytes()).hexdigest(),binding["r4_integrated_source_sha256"])
            font_patch=root/"firmware/phase2/integration-r5/native-font-index.patch"
            subprocess.run(["patch","--batch","--forward","-p1","--dry-run","-i",str(font_patch)],cwd=temp,check=True,capture_output=True,text=True)
            subprocess.run(["patch","--batch","--forward","-p1","-i",str(font_patch)],cwd=temp,check=True,capture_output=True,text=True)
            self.assertEqual(hashlib.sha256(usermod.read_bytes()).hexdigest(),binding["r5_font_only_intermediate_usermod_sha256"])

        runtime=binding["complete_runtime_source_closure"]
        self.assertEqual(hashlib.sha256((root/"firmware/phase2/integration-r5/phase2-vibe-text-runtime.patch").read_bytes()).hexdigest(),binding["r5_patch_sha256"])
        self.assertEqual(runtime["path"],"firmware/phase2/integration-r5/usermod")
        self.assertEqual(sum(item["bytes"] for item in runtime["files"]),runtime["total_bytes"])
        for item in runtime["files"]:
            path=root/runtime["path"]/item["path"]
            raw=path.read_bytes()
            self.assertEqual(len(raw),item["bytes"],item["path"])
            self.assertEqual(hashlib.sha256(raw).hexdigest(),item["sha256"],item["path"])
        integrated=root/runtime["path"]/"usermod_hbnf_foundation_v1.cpp"
        self.assertEqual(hashlib.sha256(integrated.read_bytes()).hexdigest(),binding["r5_integrated_usermod_sha256"])

    def test_acceptance_corpus(self):
        cases=[("HERO_WORD","ACE"),("HERO_WORD","WINNER"),("NAME","ANDREW"),("NAME","TEAM 4"),("NUMBER_VALUE","$187"),("NUMBER_VALUE","25 FT"),("NUMBER_VALUE","30 SEC"),("DIRECTIVE","STATION 4"),("DIRECTIVE","READY"),("DIRECTIVE","GO"),("DIRECTIVE","REST"),("SHORT_ANNOUNCEMENT","BACK 9"),("SHORT_ANNOUNCEMENT","ACE POT"),("SHORT_ANNOUNCEMENT","NEXT UP"),("LONG_FREE_TEXT","SOURCE DEPENDENT LONG MESSAGE FIXTURE")]
        for cls,text in cases:
            p=plan({"class":cls,"primary_text":text},{"vibe":"HEAVY"})
            self.assertEqual(p.moment_class,cls); self.assertFalse(p.audio_may_deform_glyphs); self.assertTrue(p.glyph_geometry_stable); self.assertTrue(p.pages)
    def test_candidate_visualmoment_keys_without_new_schema(self):
        self.assertEqual(plan({"type":"ACE","primary_text":"ACE","duration":2000,"urgency":"high","allow_audio_accent":True,"return_behavior":"RESTORE_BASE"},{"name":"COSMIC"}).moment_class,"HERO_WORD")
    def test_phrase_paging_precedes_scroll(self):
        p=plan({"class":"SHORT_ANNOUNCEMENT","primary_text":"NEXT PLAYER UP"},{"vibe":"CHILL"}); self.assertGreater(len(p.pages),1); self.assertFalse(p.marquee_fallback); self.assertEqual(p.font,"WLED_NATIVE_TOM_THUMB_6PX"); self.assertTrue(p.pages.index("PLAYER")>0)
    def test_native_font_pixel_width_paging_and_oversized_word_fallback(self):
        from tools.hbnf_text_moments_offline import _width, TEXT_WIDTH_PX
        p=plan({"class":"SHORT_ANNOUNCEMENT","primary_text":"NEXT PLAYER UP"},{"vibe":"CHILL"})
        self.assertTrue(all(_width(page)<=TEXT_WIDTH_PX or " " not in page for page in p.pages))
        q=plan({"class":"NAME","primary_text":"SUPERCALIFRAGILISTIC"},{"vibe":"CHILL"})
        self.assertTrue(q.marquee_fallback)
        self.assertEqual(q.pages,("SUPERCALIFRAGILISTIC",))
    def test_oversized_name_uses_compact_native_font_when_it_fits(self):
        from tools.hbnf_text_moments_offline import _width, TEXT_WIDTH_PX
        p=plan({"class":"NAME","primary_text":"ANDREW"},{"vibe":"CHILL"})
        self.assertEqual(p.font,"WLED_NATIVE_TOM_THUMB_6PX")
        self.assertEqual(p.pages,("ANDREW",))
        self.assertFalse(p.marquee_fallback)
        self.assertLessEqual(_width("ANDREW",p.font),TEXT_WIDTH_PX)
    def test_compact_font_fallback_applies_to_oversized_non_name_text(self):
        from tools.hbnf_text_moments_offline import _width, TEXT_WIDTH_PX
        p=plan({"class":"SHORT_ANNOUNCEMENT","primary_text":"WWWWWW"},{"vibe":"CHILL"})
        self.assertEqual(p.font,"WLED_NATIVE_TOM_THUMB_6PX")
        self.assertEqual(p.pages,("WWWWWW",))
        self.assertFalse(p.marquee_fallback)
        self.assertLessEqual(_width("WWWWWW",p.font),TEXT_WIDTH_PX)
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

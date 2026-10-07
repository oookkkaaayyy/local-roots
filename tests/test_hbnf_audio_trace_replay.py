import json
import tempfile
import unittest
from pathlib import Path

from tools.hbnf_audio_trace_replay import run

class AudioTraceReplayTests(unittest.TestCase):
    def fixture(self, source="192.168.77.10"):
        rows=[{"record_type":"capture_metadata","schema":"fixture","expected_source_ip":"192.168.77.10","expected_source_mac":"70:4b:ca:5b:34:5c","release_id":"qualified-r4","firmware_sha256":"338afd"}]
        for i in range(8):
            bins=[0]*16; bins[i%3]=220; bins[4+(i%7)]=120; bins[11+(i%5)]=90
            rows.append({"record_type":"sample","sequence":i+1,"monotonic_seconds":i*.03,"source_ip":source,"fft_result":bins,"sample_smth":100.0 if i%2 else 0.0,"sample_peak":i%2==0})
        f=tempfile.NamedTemporaryFile(mode="w",delete=False)
        f.write("\n".join(json.dumps(x) for x in rows)); f.close()
        return Path(f.name)

    def test_source_bound_trace_replays_all_features_and_manual_vibes(self):
        path=self.fixture()
        try:
            report=run(path,Path("config/HBNF_P2_VIBE_AUDIO_CANDIDATE_V1.json"))
            self.assertEqual(report["capture"]["sample_count"],8)
            self.assertEqual(len(report["features"]),13)
            self.assertEqual(len(report["manual_vibe_pairwise_mean_response_distance"]),10)
            self.assertIn("high_bins_11_15",report["band_to_visual_axis_mean_absolute_response_delta"])
        finally: path.unlink()

    def test_unexpected_source_fails_closed(self):
        path=self.fixture("192.168.77.99")
        try:
            with self.assertRaisesRegex(ValueError,"unexpected source"):
                run(path,Path("config/HBNF_P2_VIBE_AUDIO_CANDIDATE_V1.json"))
        finally: path.unlink()

if __name__=="__main__": unittest.main()

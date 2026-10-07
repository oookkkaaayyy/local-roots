import importlib.util
import math
import struct
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "tools" / "hbnf_audio_udp_v2_capture.py"
SPEC = importlib.util.spec_from_file_location("hbnf_audio_udp_v2_capture", SCRIPT)
CAPTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAPTURE)


def fixture_packet():
    packet = bytearray(44)
    packet[:6] = b"00002\0"
    struct.pack_into("<f", packet, 8, 0.25)
    struct.pack_into("<f", packet, 12, 0.5)
    packet[16] = 1
    packet[18:34] = bytes(range(16))
    struct.pack_into("<f", packet, 36, 1.25)
    struct.pack_into("<f", packet, 40, 440.0)
    return bytes(packet)


class AudioUdpV2CaptureTests(unittest.TestCase):
    def test_controlled_category_is_bound_to_capture_metadata(self):
        metadata = CAPTURE.capture_metadata(
            30, matrix_ip="192.168.77.10", matrix_mac="70:4b:ca:5b:34:5c",
            release_id="candidate", firmware_sha256="a" * 64,
            label="BASS_HEAVY")
        self.assertEqual(metadata["category_label"], "BASS_HEAVY")
        self.assertFalse(metadata["audio_recording"])
        with self.assertRaisesRegex(ValueError, "label must be one of"):
            CAPTURE.capture_metadata(
                30, matrix_ip="192.168.77.10", matrix_mac="70:4b:ca:5b:34:5c",
                release_id="candidate", firmware_sha256="a" * 64,
                label="UNCONTROLLED")

    def test_exact_v2_packet_fields(self):
        got = CAPTURE.parse_packet(fixture_packet())
        self.assertEqual(got["sample_raw"], 0.25)
        self.assertEqual(got["sample_smth"], 0.5)
        self.assertTrue(got["sample_peak"])
        self.assertEqual(got["fft_result"], list(range(16)))
        self.assertEqual(got["fft_magnitude"], 1.25)
        self.assertEqual(got["fft_major_peak"], 440.0)

    def test_wrong_version_rejected(self):
        packet = bytearray(fixture_packet())
        packet[4] = ord("1")
        with self.assertRaisesRegex(ValueError, "not WLED"):
            CAPTURE.parse_packet(bytes(packet))

    def test_wrong_packet_length_rejected(self):
        with self.assertRaisesRegex(ValueError, "expected 44 bytes"):
            CAPTURE.parse_packet(b"00002\0")


if __name__ == "__main__":
    unittest.main()

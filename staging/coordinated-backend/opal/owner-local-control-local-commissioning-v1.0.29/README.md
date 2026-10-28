# Opal local UV test-readback diagnostics v1.0.29

This narrow update makes the existing bounded commissioning pulse report which exact gateway step failed. The v1.0.28 live test returned `uv_commissioning_test_on_unconfirmed`; this update distinguishes WLED apply HTTP failure, internal GET/readback failure, segment mismatch, and OFF confirmation failure. The three-second pulse, automatic both-segment OFF, normal UV hardware-profile lock, Owner/origin checks, and Matrix/AUX behavior remain unchanged.

The package contains the complete exact v1.0.28 rollback image and updated-file manifest. Install only with its one-time shared release admission and fresh target readback.

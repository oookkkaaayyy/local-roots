# Exact full-PWA source bundle

Build: `hbnf-build-10.24.26-cart-uv-preview-v3`
Mobile UI: `hbnf-mobile-ui-pass-2` with guarded per-channel UV request feedback

The six `HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.partXX` files concatenate to the exact tested source ZIP.

Verified:
- Base64 characters: 31,072
- Base64 SHA256: `cbda7aed9035f3d7c05c4de5f6211ff412f04df24bd9360f0f9ab9e75b00b3cd`
- decoded ZIP bytes: 23,302
- decoded ZIP SHA256: `f7eed37051ceea8c22df9a211bb53cb48adc4c007c193ef66b93b1085dda5034`
- JavaScript syntax: PASS
- full-PWA regression: 33/33 PASS
- UV controls: independent Main and Short levels; Manual, Follow Matrix, Follow WOW audio, Off
- Follow modes require fresh online samples; WOW audio additionally requires the exact runtime release and sample age <=15 seconds
- preview remains visible while AUX is unavailable; live AUX controls stay disabled unless controller and channel gates pass
- checked-in hardware profile is unverified and `HBNF_UV_ENABLED` defaults off; default output is zero and no MQTT publish occurs
- guarded success response, if enabled after physical verification, reports MQTT QoS 1 broker acceptance only, not device readback
- inherited CSS widths were visually checked at 744x1133 portrait and 1133x744 landscape on the prior source; the new AUX-disabled expanded Cart panel state is NOT CHECKED at those viewports
- actual Safari/Home Screen and physical UV acceptance: NOT CHECKED

Reconstruct:

```bash
cat HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.part* > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64
tr -d '\n' < HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64 | base64 --decode > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
```

The ZIP is a source review artifact; it does not install itself.

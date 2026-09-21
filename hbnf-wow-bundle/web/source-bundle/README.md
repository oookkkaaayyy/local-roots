# Exact full-PWA source bundle

Build: `hbnf-build-9.21.26-wow-max-v3-full`
Mobile UI: `hbnf-mobile-ui-pass-2`

The six `HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.partXX` files concatenate to the exact tested source ZIP.

Verified:
- Base64 characters: 27,088
- Base64 SHA256: `2399ce9c06377c10afdabe256365fe6ebc7013a2519ea565fe7af61b2586bd70`
- decoded ZIP bytes: 20,316
- decoded ZIP SHA256: `ad32a0e6e24c130c9b4ed831b2b4d1af9c009472fcdf57e74f8ff884eaf9bdcc`
- JavaScript syntax: PASS
- full-PWA regression: 30/30 PASS

Reconstruct:

```bash
cat HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.part* > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64
tr -d '\n' < HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64 | base64 --decode > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
```

The ZIP contains the exact tested mobile-first `matrix.html`, `matrix-control.js`, manifest, 30/30 regression suite, guarded Wrangler deploy script, and README. It does not mutate the Matrix by itself.

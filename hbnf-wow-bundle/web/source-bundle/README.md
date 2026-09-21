# Exact full-PWA source bundle

Build: `hbnf-build-9.21.26-wow-max-v3-full`

The five `HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.partXX` files concatenate to the exact tested ZIP source bundle.

Verified:
- all 5 Git blob SHAs match the locally generated source parts
- concatenated Base64 length: 25,332 characters
- Base64 stream SHA256: `739cec5fecdb5290b4853c292f94b4700ba9c5f8ef2bff72a37c584001eca880`
- decoded ZIP bytes: 18,997
- decoded ZIP SHA256: `90b29bc0c6a51515c552431c580b6753c0811b2503387b86faedeb18d513c017`

Reconstruct:

```bash
cat HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.part* | tr -d '\n' | base64 --decode > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
```

The ZIP contains the exact tested `matrix.html`, `matrix-control.js`, manifest, 25/25 regression suite, guarded Wrangler deploy script, and README. It does not mutate the Matrix by itself.

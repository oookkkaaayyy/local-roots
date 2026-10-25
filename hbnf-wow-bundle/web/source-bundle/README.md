# Exact full-PWA source bundle

Build: `hbnf-build-10.24.26-cart-uv-preview-v1`
Mobile UI: `hbnf-mobile-ui-pass-2` with independent Cart UV response preview

The six `HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.partXX` files concatenate to the exact tested source ZIP.

Verified:
- Base64 characters: 29,692
- Base64 SHA256: `6b4054fa08642c926bef4bec986235cd26b6f3af2bf5e3608fdede1cbf4e86b3`
- decoded ZIP bytes: 22,267
- decoded ZIP SHA256: `0dc5163592d6a5a6dfa2ad883e46da399e1a267067d449a60e4085cea8f5b91d`
- JavaScript syntax: PASS
- full-PWA regression: 32/32 PASS
- UV preview: Main and Short; Manual, Follow Matrix, Follow WOW audio, Off
- Follow modes require fresh online values; WOW audio additionally requires exact runtime release and sample age <=15 seconds
- AUX returns `mutationIssued:false`, computes zero output, and does not publish
- exact viewport visual check: 744x1133 portrait preserved; 1133x744 landscape now uses full width
- actual Safari/Home Screen and physical UV acceptance: NOT CHECKED

Reconstruct:

```bash
cat HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64.part* > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64
tr -d '\n' < HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.b64 | base64 --decode > HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
shasum -a 256 HBNF_MATRIX_WOW_FULL_PWA_V3_SOURCE.zip
```

The ZIP contains exact tested PWA files and is a source review artifact; it does not install itself.

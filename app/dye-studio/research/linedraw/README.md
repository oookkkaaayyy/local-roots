Line-drawing stencil research (2026-11-19).
Model: Informative Drawings generator (sk_model.pth, 17 MB) from huggingface.co/lllyasviel/Annotators. Subject mask: u2netp (already bundled).
ld.py runs the generator. proto.py combines line map, shadow fill and silhouette ring into a two-tone stencil. crops.mjs frames the head. cc.mjs runs the Cricut compiler check.
Result on 6 gallery photos: close to gallery style, 4 of 6 compile PASS before tuning.

#!/usr/bin/env python3
"""Build a deterministic, key-free Opal Skins relay installation archive."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import pathlib
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / "staging/coordinated-backend/opal"
VERSION = (BASE / "VERSION-skins-relay").read_text(encoding="utf-8").strip()
FILES = [
    BASE / "hbnf-skins-relay",
    BASE / "hbnf-skins-relay-core.sh",
    BASE / "hbnf-skins-relay.init",
    BASE / "hbnf-skins-relay.conf.example",
    BASE / "README-skins-relay.md",
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=pathlib.Path)
    args = parser.parse_args()
    members = [(p.name, p.read_bytes()) for p in FILES]
    manifest = {
        "schema": "hbnf-opal-skins-relay-package-v1",
        "package": "hbnf-opal-skins-relay",
        "version": VERSION,
        "source_base_commit": "00e6552ffe65a3dbd6768b0e017fd22226c5b86f",
        "installed_matrix_source_commit": "d01a2f6f5ae02deb0901dc48490de0cd777ee9fa",
        "compatible_matrix_releases": {
            "hbnf-cart2-phase2-r6-vibe-first-ui-20261012": "43a33dfa21127a79f643ede9b2a054ff1aa21705b7733cfebea9c8a3e105c5f3",
            "hbnf-cart2-phase2-r6-skins-readable-20261014": "de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d",
        },
        "supabase_function": "hbnf-cart-control",
        "requires_selector_version": "skins-front-lock-v1",
        "files": {name: sha256(data) for name, data in members},
    }
    members.append(("MANIFEST.json", (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for name, data in members:
            info = tarfile.TarInfo(f"hbnf-opal-skins-relay-{VERSION}/{name}")
            info.size = len(data)
            info.mtime = 0
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mode = 0o755 if name in {"hbnf-skins-relay", "hbnf-skins-relay.init"} else 0o644
            archive.addfile(info, io.BytesIO(data))
    with args.out.open("wb") as output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0, compresslevel=9) as gz:
            gz.write(raw.getvalue())
    digest = sha256(args.out.read_bytes())
    args.out.with_suffix(args.out.suffix + ".sha256").write_text(f"{digest}  {args.out.name}\n", encoding="ascii")
    print(json.dumps({"path": str(args.out), "size_bytes": args.out.stat().st_size, "sha256": digest}, sort_keys=True))


if __name__ == "__main__":
    main()

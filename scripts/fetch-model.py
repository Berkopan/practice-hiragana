#!/usr/bin/env python3
"""Download the pinned, MIT-licensed DaKanji weights at build time.

The published site serves the resulting file itself. The application never loads
model weights from GitHub or sends handwriting to a remote recognition service.
Only Python's standard library is required.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "public" / "models"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    provenance = json.loads((MODEL_DIR / "provenance.json").read_text(encoding="utf-8"))
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for asset in provenance["files"]:
        destination = MODEL_DIR / asset["path"]
        if destination.exists() and digest(destination.read_bytes()) == asset["sha256"]:
            print(f"Verified {asset['path']}")
            continue
        print(f"Downloading {asset['path']} from the pinned DaKanji v2.0 release")
        request = urllib.request.Request(asset["download"], headers={"User-Agent": "practice-hiragana-asset-build/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            archive = response.read(30_000_001)
        if len(archive) > 30_000_000 or digest(archive) != asset["archiveSha256"]:
            raise SystemExit(f"Archive integrity check failed for {asset['path']}; refusing to install changed upstream bytes.")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            # Read one explicitly named file, never extract paths from an archive.
            content = bundle.read(asset["path"])
        if len(content) != asset["bytes"] or digest(content) != asset["sha256"]:
            raise SystemExit(f"Model integrity check failed for {asset['path']}.")
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_bytes(content)
        temporary.replace(destination)
        print(f"Installed and verified {asset['path']} ({len(content):,} bytes)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Refresh bundled data/artwork from a reviewed berserk-nxt checkout.

Usage: python3 scripts/sync_upstream.py /path/to/berserk-nxt
Network access and source checkout management are deliberately left to the caller.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
from gather_set import validate_bundle
from import_set import import_bundle

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("checkout", type=Path)
args = parser.parse_args()
source = args.checkout.resolve()
root = Path(__file__).resolve().parent.parent
# Validate locally gathered sets before touching upstream files. They are reapplied
# below so a refresh of the older upstream catalog cannot remove them.
bundles = sorted((root / "data/sets").glob("*/config.json"))
for config_path in bundles:
    config = json.loads(config_path.read_text())
    validate_bundle(config_path.parent, root / "public/cards" / str(config["set_id"]))
cards = json.loads((source / "resources/data.json").read_text())
constants = json.loads((source / "resources/const.json").read_text())
ratings_source = (source / "src/renderer/src/utils/draft.js").read_text()
ratings = {}
for name in ("motd_order", "karapet_score"):
    match = re.search(r"export const " + name + r" = (\{.*?\n\})", ratings_source, re.S)
    if not match:
        raise SystemExit(f"Upstream {name} format changed; review the importer.")
    ratings[name] = json.loads(match.group(1))
# Validate before changing any bundled files.
for card in cards:
    for alt in [""] + card["alts"]:
        suffix = constants["art_suffix"].get(alt, alt)
        asset = source / f"src/renderer/cards/{card['set_id']}/{card['number']}{suffix}.{card['fmt']}"
        if not asset.exists():
            raise SystemExit(f"Missing upstream artwork: {asset}")
revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
shutil.copy2(source / "resources/data.json", root / "data/cards.json")
shutil.copy2(source / "resources/const.json", root / "data/constants.json")
shutil.copytree(source / "src/renderer/cards", root / "public/cards", dirs_exist_ok=True)
for name, data in ratings.items():
    (root / f"data/{name}.json").write_text(json.dumps(data, ensure_ascii=False))
(root / "data/UPSTREAM_REVISION").write_text(revision + "\n")
for config_path in bundles:
    import_bundle(config_path.parent, root, apply=True, installed=True)
print(f"Imported {len(cards)} base cards at {revision}. Run cargo test before committing.")

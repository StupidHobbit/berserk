#!/usr/bin/env python3
"""Validate and install a gathered set without replacing other sets or user data."""
import argparse
import json
from pathlib import Path
import shutil

from gather_set import ROOT, validate_bundle, write_json


def import_bundle(bundle, root=ROOT, apply=False, installed=False):
    config = json.loads((bundle / "config.json").read_text())
    set_id = config["set_id"]
    if not isinstance(set_id, int) or not 1 <= set_id <= 999:
        raise ValueError("Invalid set ID")
    images = root / "public/cards" / str(set_id)
    config, cards, manifest = validate_bundle(bundle, images if installed else None)
    existing = json.loads((root / "data/cards.json").read_text())
    constants = json.loads((root / "data/constants.json").read_text())
    next_cards = [c for c in existing if c["set_id"] != set_id] + cards
    if len({c["id"] for c in next_cards}) != len(next_cards):
        raise ValueError("Card ID collision")
    constants["sets"][str(set_id)] = config["name"]
    constants["alternatives"].update(config["edition_labels"])
    constants["tts_options"]["sets"][str(set_id)] = config["name"]
    unavailable = constants["tts_options"].setdefault("unavailable_sets", [])
    if str(set_id) not in unavailable:
        unavailable.append(str(set_id))
    print(f"Validated {config['name']}: {len(cards)} base cards, {manifest['editions']} editions, "
          f"{len(manifest['missing_edition_artwork'])} missing edition scans.")
    print(f"Catalog: {len(existing)} -> {len(next_cards)} base cards. Other sets retained.")
    if not apply:
        print("Dry run. Pass --apply to install.")
        return
    if not installed:
        # All source/schema/hash checks above complete before touching app data.
        images.mkdir(parents=True, exist_ok=True)
        for card in cards:
            filename = f"{card['number']}.jpg"
            shutil.copy2(bundle / "cards" / filename, images / filename)
        destination = root / "data/sets" / str(set_id)
        destination.mkdir(parents=True, exist_ok=True)
        for name in ("cards.json", "config.json", "manifest.json"):
            shutil.copy2(bundle / name, destination / name)
        shutil.copytree(bundle / "sources", destination / "sources", dirs_exist_ok=True)
    write_json(root / "data/constants.json", constants)
    write_json(root / "data/cards.json", next_cards)
    print("Installed. Run cargo test --locked and rebuild the browser app.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--installed", action="store_true", help="Verify/reapply saved metadata using public/cards assets")
    args = parser.parse_args()
    import_bundle(args.bundle.resolve(), apply=args.apply, installed=args.installed)


if __name__ == "__main__":
    main()

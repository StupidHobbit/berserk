"""Offline regression tests using the exact collected source snapshots."""
import copy
import gzip
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from gather_set import parse_listing, parse_detail, parse_checklist, validate_bundle, jpeg_size
from import_set import import_bundle

BUNDLE = ROOT / "data/sets/80"


class SetToolsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads((BUNDLE / "config.json").read_text())
        cls.manifest = json.loads((BUNDLE / "manifest.json").read_text())
        cls.cards = json.loads((BUNDLE / "cards.json").read_text())
        cls.snapshots = {s["url"]: gzip.decompress((BUNDLE / "sources" / (s["sha256"] + ".html.gz")).read_bytes())
                         for s in cls.manifest["sources"]}

    def test_rebuilds_every_card_and_edition_from_recorded_sources(self):
        entries = parse_listing(self.snapshots[self.config["listing_url"]], self.config)
        cards = [parse_detail(self.snapshots[url], card, image, url) for card, url, image in entries]
        warnings = parse_checklist(self.snapshots[self.config["checklist_url"]], self.config, cards)
        self.assertEqual(cards, self.cards)
        self.assertEqual(warnings, self.manifest["warnings"])
        self.assertTrue(all(w["review"].startswith("Listing spelling verified") for w in warnings))
        self.assertEqual(cards[0]["art"], "Антон Квасоваров")
        self.assertIn("{instant}", cards[0]["text"])
        self.assertEqual(cards[5]["icons"], {"ovz": 1, "armor": 1})
        self.assertTrue(cards[2]["uniq"])

    def test_full_bundle_and_every_image_verify(self):
        config, cards, _ = validate_bundle(BUNDLE, ROOT / "public/cards/80")
        self.assertEqual(config["name"], "Сердце роя")
        self.assertEqual(len(cards), 220)
        self.assertEqual(sum(1 + len(c["alts"]) for c in cards), 354)
        self.assertEqual(sum(len(c["missing_art"]) for c in cards), 61)
        for invalid in (b"<html>not an image</html>", b"\xff\xd8\xff\xd9"):
            with self.assertRaises(ValueError):
                jpeg_size(invalid)

    def test_rejects_incomplete_or_changed_sources(self):
        config = {**self.config, "expected_cards": 221}
        with self.assertRaises(ValueError):
            parse_listing(self.snapshots[self.config["listing_url"]], config)
        config = {**self.config, "expected_editions": 355}
        with self.assertRaises(ValueError):
            parse_checklist(self.snapshots[self.config["checklist_url"]], config, copy.deepcopy(self.cards))
        card, url, image = parse_listing(self.snapshots[self.config["listing_url"]], self.config)[0]
        card["name"] = "Wrong card"
        with self.assertRaises(ValueError):
            parse_detail(self.snapshots[url], card, image, url)

    def test_install_is_idempotent_and_preserves_other_sets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            original = json.loads((ROOT / "data/cards.json").read_text())[0]
            (root / "data/cards.json").write_text(json.dumps([original]))
            (root / "data/constants.json").write_bytes((ROOT / "data/constants.json").read_bytes())
            (root / "public/cards").mkdir(parents=True)
            # Read the verified installed assets without duplicating 35 MB per test.
            (root / "public/cards/80").symlink_to(ROOT / "public/cards/80", target_is_directory=True)
            import_bundle(BUNDLE, root, apply=True, installed=True)
            first = (root / "data/cards.json").read_bytes()
            import_bundle(BUNDLE, root, apply=True, installed=True)
            self.assertEqual(first, (root / "data/cards.json").read_bytes())
            data = json.loads(first)
            self.assertEqual(data[0], original)
            self.assertEqual(len(data), 221)
            constants = json.loads((root / "data/constants.json").read_text())
            self.assertEqual(constants["sets"]["80"], "Сердце роя")

    def test_checksum_failure_prevents_catalog_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle = root / "bad-bundle"
            bundle.mkdir()
            for name in ("config.json", "manifest.json", "cards.json"):
                shutil.copy2(BUNDLE / name, bundle / name)
            with (bundle / "cards.json").open("a") as file:
                file.write(" ")
            (root / "data").mkdir()
            original = b"[]"
            (root / "data/cards.json").write_bytes(original)
            with self.assertRaisesRegex(ValueError, "checksum"):
                import_bundle(bundle, root, apply=True)
            self.assertEqual((root / "data/cards.json").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()

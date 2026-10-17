#!/usr/bin/env python3
"""Collect a ProBerserk set and a LastSticker edition checklist into a verified bundle.

Network writes only to --cache and --output. Run import_set.py separately to install.
Cached downloads are immutable; --offline replays them without network requests.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import threading
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
COLORS = {"Степи": 1, "Горы": 2, "Леса": 4, "Болота": 8, "Тьма": 16, "Нейтральная": 32}
KINDS = {"Существо": 0, "Существо – Летающее": 1, "Существо – Компаньон": 2,
         "Существо – Паразит": 3, "Артефакт": 4, "Местность": 5}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def text(node):
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def canonical(name):
    return " ".join(name.lower().replace("ё", "е").split())


class Fetcher:
    def __init__(self, cache, offline=False):
        self.cache = cache
        self.offline = offline
        self.records = {}
        self.lock = threading.Lock()
        cache.mkdir(parents=True, exist_ok=True)

    def get(self, url):
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username:
            raise ValueError(f"Expected a public HTTPS URL: {url}")
        key = sha(url.encode())
        body, meta = self.cache / (key + ".bin"), self.cache / (key + ".json")
        if not body.exists() or not meta.exists():
            if self.offline:
                raise ValueError(f"Not cached (offline mode): {url}")
            temp = body.with_suffix(".part")
            subprocess.run([
                "curl", "--fail", "--silent", "--show-error", "--location",
                "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "10",
                "--max-time", "40", "--retry", "2", "--retry-delay", "1",
                "--max-filesize", "12000000", "--user-agent", "BerserkLeptos-SetCollector/1.0",
                url, "--output", str(temp),
            ], check=True)
            data = temp.read_bytes()
            temp.replace(body)
            write_json(meta, {"url": url, "sha256": sha(data), "bytes": len(data),
                              "retrieved_at": datetime.now(timezone.utc).isoformat()})
        data, record = body.read_bytes(), json.loads(meta.read_text())
        if record["url"] != url or record["sha256"] != sha(data):
            raise ValueError(f"Cache checksum mismatch: {url}")
        with self.lock:
            self.records[url] = record
        return data


def parse_listing(html, config):
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("#datatable tbody tr")
    cards = []
    for row in rows:
        cells = row.find_all("td", recursive=False)
        if len(cells) != 11:
            raise ValueError("Listing schema changed: expected 11 columns")
        number = int(text(cells[0]))
        link = cells[1].find("a", href=True)
        if not link:
            raise ValueError(f"Card {number}: no detail link")
        preview = BeautifulSoup(link.get("data-bs-content", ""), "html.parser").find("img")
        if not preview:
            raise ValueError(f"Card {number}: no image URL")
        cost_icon = cells[3].find("img")["src"]
        rarity = int(text(cells[5]).split("-", 1)[0])
        icons = {}
        for img in cells[10].find_all("img"):
            key = img["alt"]
            following = str(img.next_sibling or "").strip()
            match = re.match(r":\s*(\d+)", following)
            icons[key] = int(match[1]) if match else 0
        color = 0
        for image in cells[4].find_all("img"):
            color |= COLORS[image["alt"]]
        if not color:
            raise ValueError(f"Card {number}: no element")
        movement = text(cells[8])
        card = {
            "id": str(config["set_id"] * 1000 + number), "set_id": config["set_id"],
            "number": number, "name": text(link), "rarity": rarity,
            "cost": int(text(cells[3])), "elite": "icon-elite" in cost_icon,
            "uniq": "-unique" in cost_icon, "color": color,
            "class": [c.strip() for c in text(cells[2]).split(",") if c.strip()],
            "type": KINDS[text(cells[6])],
            "life": int(text(cells[7])) if text(cells[7]) else None,
            "move": int(movement) if movement.isdigit() else None,
            "hit": [int(n) for n in text(cells[9]).split("-")] if text(cells[9]) else None,
            "icons": icons, "art": "", "text": "", "tokens": "", "horde": False,
            "prints": {}, "alts": [], "fmt": "jpg", "missing_art": [],
        }
        cards.append((card, urljoin(config["listing_url"], link["href"]),
                      urljoin(config["listing_url"], preview["src"])))
    numbers = [c[0]["number"] for c in cards]
    if sorted(numbers) != list(range(1, config["expected_cards"] + 1)):
        raise ValueError("Set is incomplete or has duplicate/out-of-range card numbers")
    return cards


def parse_detail(html, card, expected_image, source_url):
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main")
    if not main or canonical(text(main.find("h4"))) != canonical(card["name"]):
        raise ValueError(f"Detail page does not match card {card['id']}")
    image = main.find("img")
    if not image or urljoin(source_url, image["src"]) != expected_image:
        raise ValueError(f"Image mismatch for {card['id']}")
    fields = {text(r.find("th")): r.find("td") for r in main.select("table tr") if r.find("th")}
    if "Текст" not in fields or "Художник" not in fields:
        raise ValueError(f"Missing rules or artist field for {card['id']}")
    rules = fields["Текст"]
    for img in rules.find_all("img"):
        key = img.get("alt", "")
        if not re.fullmatch(r"[a-z]+", key):
            raise ValueError(f"Unknown rule icon: {key}")
        img.replace_with("{" + key + "}")
    for br in rules.find_all("br"):
        br.replace_with("\n")
    card["text"] = text(rules)
    card["art"] = text(fields["Художник"])
    card["horde"] = bool(re.search(r"\bОрда\b", card["text"], re.I))
    card["tokens"] = " ".join([card["name"], *card["class"], card["text"]]).lower()
    return card


def parse_checklist(html, config, cards):
    rows = BeautifulSoup(html, "html.parser").select("#checklist tbody tr")
    if len(rows) != config["expected_editions"]:
        raise ValueError(f"Checklist has {len(rows)} editions; expected {config['expected_editions']}")
    by_number = {c["number"]: c for c in cards}
    seen, warnings = set(), []
    for row in rows:
        cells = row.find_all("td", recursive=False)
        match = re.fullmatch(r"(\d+)([a-z_0-9]*)", text(cells[0]))
        if not match:
            raise ValueError("Unrecognized edition identifier")
        number, alt = int(match[1]), match[2]
        if (number, alt) in seen or number not in by_number:
            raise ValueError(f"Duplicate or unknown checklist card: {number}{alt}")
        seen.add((number, alt))
        card = by_number[number]
        if canonical(text(cells[1])) != canonical(card["name"]):
            warnings.append({"id": card["id"] + alt, "kind": "name_difference",
                             "listing": card["name"], "checklist": text(cells[1]),
                             "review": "Listing spelling verified against downloaded card scan"
                             if config.get("name_reviews", {}).get(card["id"]) == card["name"]
                             else "Unreviewed; listing spelling retained"})
        if alt:
            if alt not in config["edition_labels"]:
                raise ValueError(f"Unknown edition suffix {alt}; review the set configuration")
            card["alts"].append(alt)
            # Ordinary foils use the same illustration. All other scans are unavailable
            # in these sources; preserve the edition without pretending to have its art.
            if alt != "f":
                card["missing_art"].append(alt)
    if {n for n, a in seen if not a} != set(by_number):
        raise ValueError("Checklist is missing base cards")
    return warnings


def jpeg_size(data):
    if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        raise ValueError("Downloaded artwork is not a complete JPEG")
    offset = 2
    while offset + 9 < len(data):
        if data[offset] != 255:
            raise ValueError("Invalid JPEG marker")
        marker = data[offset + 1]
        length = int.from_bytes(data[offset + 2:offset + 4], "big")
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(data[offset + 5:offset + 7], "big")
            width = int.from_bytes(data[offset + 7:offset + 9], "big")
            if width < 200 or height < 280:
                raise ValueError(f"Artwork too small: {width}x{height}")
            return width, height
        if length < 2:
            raise ValueError("Invalid JPEG segment")
        offset += length + 2
    raise ValueError("JPEG dimensions not found")


def validate_bundle(path, artwork_dir=None):
    config = json.loads((path / "config.json").read_text())
    cards = json.loads((path / "cards.json").read_text())
    manifest = json.loads((path / "manifest.json").read_text())
    if sha((path / "cards.json").read_bytes()) != manifest["cards_sha256"]:
        raise ValueError("Card data checksum mismatch")
    if sha((path / "config.json").read_bytes()) != manifest["config_sha256"]:
        raise ValueError("Set configuration checksum mismatch")
    if not isinstance(config["set_id"], int) or not 1 <= config["set_id"] <= 999:
        raise ValueError("Invalid set id")
    if sorted(c["number"] for c in cards) != list(range(1, config["expected_cards"] + 1)):
        raise ValueError("Incomplete or duplicate card numbers")
    if sum(1 + len(c["alts"]) for c in cards) != config["expected_editions"]:
        raise ValueError("Incomplete editions")
    for c in cards:
        if c["set_id"] != config["set_id"] or c["id"] != str(c["set_id"] * 1000 + c["number"]):
            raise ValueError("Invalid card identity")
        if c["rarity"] not in (1, 2, 3, 4) or not 0 <= c["type"] <= 5 or not c["name"]:
            raise ValueError("Invalid card fields")
        if c["fmt"] != "jpg" or len(set(c["alts"])) != len(c["alts"]):
            raise ValueError("Invalid artwork format or duplicate editions")
        if not set(c["missing_art"]) <= set(c["alts"]) <= set(config["edition_labels"]):
            raise ValueError("Unrecognized edition metadata")
        asset = (artwork_dir or path / "cards") / f"{c['number']}.jpg"
        data = asset.read_bytes()
        if sha(data) != manifest["artwork"][c["id"]]["sha256"]:
            raise ValueError(f"Artwork checksum mismatch: {c['id']}")
        jpeg_size(data)
    for item in manifest["sources"]:
        if not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
            raise ValueError("Invalid snapshot checksum")
        snapshot = path / "sources" / (item["sha256"] + ".html.gz")
        if sha(gzip.decompress(snapshot.read_bytes())) != item["sha256"]:
            raise ValueError("Source snapshot checksum mismatch")
    return config, cards, manifest


def gather(config_path, output, cache, workers, offline):
    config = json.loads(config_path.read_text())
    fetcher = Fetcher(cache, offline)
    listing = fetcher.get(config["listing_url"])
    checklist = fetcher.get(config["checklist_url"])
    entries = parse_listing(listing, config)
    output.mkdir(parents=True, exist_ok=True)
    (output / "cards").mkdir(exist_ok=True)
    snapshots = {config["listing_url"]: listing, config["checklist_url"]: checklist}
    artwork, cards = {}, []

    def collect(entry):
        card, detail_url, image_url = entry
        detail = fetcher.get(detail_url)
        parse_detail(detail, card, image_url, detail_url)
        image = fetcher.get(image_url)
        width, height = jpeg_size(image)
        (output / "cards" / f"{card['number']}.jpg").write_bytes(image)
        return card, detail_url, detail, {**fetcher.records[image_url], "width": width, "height": height}

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(collect, entry) for entry in entries]
        for i, future in enumerate(as_completed(futures), 1):
            card, detail_url, detail, image_record = future.result()
            cards.append(card)
            snapshots[detail_url] = detail
            artwork[card["id"]] = image_record
            if i % 20 == 0 or i == len(entries):
                print(f"Collected {i}/{len(entries)} cards and images", flush=True)
    cards.sort(key=lambda c: c["number"])
    warnings = parse_checklist(checklist, config, cards)
    write_json(output / "config.json", config)
    write_json(output / "cards.json", cards)
    (output / "sources").mkdir(exist_ok=True)
    for data in snapshots.values():
        (output / "sources" / (sha(data) + ".html.gz")).write_bytes(gzip.compress(data, mtime=0))
    manifest = {
        "schema_version": 1, "set_id": config["set_id"], "name": config["name"],
        "base_cards": len(cards), "editions": sum(1 + len(c["alts"]) for c in cards),
        "cards_sha256": sha((output / "cards.json").read_bytes()),
        "config_sha256": sha((output / "config.json").read_bytes()),
        "sources": [fetcher.records[u] for u in sorted(snapshots)],
        "artwork": dict(sorted(artwork.items())), "warnings": warnings,
        "missing_edition_artwork": [c["id"] + a for c in cards for a in c["missing_art"]],
        "notes": ["Base artwork is explicitly used as a placeholder for editions without scans.",
                  "No draft ratings, printing dates, bans, or TTS atlas URLs have been inferred.",
                  "Publisher page is a reference only; collection uses the two listed public databases."],
    }
    write_json(output / "manifest.json", manifest)
    validate_bundle(output)
    print(f"Verified bundle: {len(cards)} cards / {manifest['editions']} editions at {output}", flush=True)
    print(f"Missing edition scans: {len(manifest['missing_edition_artwork'])}; source name differences: {len(warnings)}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/set-data")
    parser.add_argument("--workers", type=int, default=3, choices=range(1, 5))
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    gather(args.config, args.output, args.cache, args.workers, args.offline)


if __name__ == "__main__":
    main()

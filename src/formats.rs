use crate::model::*;
use std::collections::BTreeMap;

pub fn read_deck(input: &str, catalog: &Catalog, id: String) -> Result<Deck, String> {
    let mut deck = Deck::new(id, "Импортированная колода".into());
    let mut side = false;
    for (line_no, line) in input.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line == "---side---" {
            side = true;
            continue;
        }
        if let Some(value) = line.strip_prefix("# allowed_sets: ") {
            deck.allowed_sets = serde_json::from_str(value)
                .map_err(|_| format!("Строка {}: неверные разрешённые наборы", line_no + 1))?;
            continue;
        }
        if let Some(value) = line.strip_prefix("# description: ") {
            deck.description = serde_json::from_str(value)
                .map_err(|_| format!("Строка {}: неверное описание", line_no + 1))?;
            continue;
        }
        if let Some(value) = line.strip_prefix("# how_to_play: ") {
            deck.how_to_play = serde_json::from_str(value)
                .map_err(|_| format!("Строка {}: неверный план игры", line_no + 1))?;
            continue;
        }
        if let Some(value) = line.strip_prefix("# improvements: ") {
            deck.improvements = serde_json::from_str(value)
                .map_err(|_| format!("Строка {}: неверные рекомендации", line_no + 1))?;
            continue;
        }
        if let Some(name) = line.strip_prefix('#') {
            deck.name = name.trim().into();
            continue;
        }
        let (count, name) = line
            .split_once(char::is_whitespace)
            .ok_or_else(|| format!("Строка {}: ожидается «число имя карты»", line_no + 1))?;
        let count = count
            .parse::<usize>()
            .map_err(|_| format!("Строка {}: неверное количество", line_no + 1))?;
        if count > 1000 || deck.cards.len() + deck.side.len() + count > 10000 {
            return Err("Слишком много карт".into());
        }
        let name = name.trim();
        let card = catalog
            .get(name)
            .or_else(|| {
                catalog.cards.iter().rev().find(|c| {
                    c.alt.is_empty()
                        && deck.allows(c)
                        && normalize(c.name.trim()) == normalize(name.trim())
                })
            })
            .ok_or_else(|| format!("Строка {}: неизвестная карта «{name}»", line_no + 1))?;
        for _ in 0..count {
            deck.add(&card.id, side);
        }
    }
    if deck.cards.is_empty() && deck.side.is_empty() {
        return Err("В файле нет карт".into());
    }
    deck.validate_sets(catalog)?;
    Ok(deck)
}
pub fn write_deck(deck: &Deck, catalog: &Catalog, names: bool) -> String {
    let mut lines = vec![format!("# {}", deck.name.replace(['\n', '\r'], " "))];
    if let Some(sets) = &deck.allowed_sets {
        lines.push(format!(
            "# allowed_sets: {}",
            serde_json::to_string(sets).unwrap()
        ));
    }
    for (key, value) in [
        ("description", &deck.description),
        ("how_to_play", &deck.how_to_play),
        ("improvements", &deck.improvements),
    ] {
        if !value.is_empty() {
            lines.push(format!(
                "# {key}: {}",
                serde_json::to_string(value).expect("String is serializable")
            ));
        }
    }
    for (side, ids) in [(false, &deck.cards), (true, &deck.side)] {
        if side && !ids.is_empty() {
            lines.push("---side---".into());
        }
        for (id, n) in grouped(ids) {
            let name = if names {
                catalog.get(&id).map(|c| c.name.as_str()).unwrap_or(&id)
            } else {
                &id
            };
            lines.push(format!("{n} {name}"));
        }
    }
    lines.join("\n")
}
pub fn read_collection(
    input: &str,
    catalog: &Catalog,
) -> Result<BTreeMap<String, CollectionEntry>, String> {
    let mut result: BTreeMap<String, CollectionEntry> = BTreeMap::new();
    for (n, line) in input.trim_start_matches('\u{feff}').lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let fail = || format!("Строка {}: неверная запись коллекции", n + 1);
        let mut parts = line.split_whitespace();
        let id = parts.next().ok_or_else(fail)?;
        if catalog.get(id).is_none() {
            return Err(format!("Неизвестная карта: {id}"));
        }
        let count = parts
            .next()
            .ok_or_else(fail)?
            .parse::<u32>()
            .map_err(|_| fail())?;
        let mut entry = CollectionEntry::default();
        entry.count.insert("".into(), count);
        let mut costs = false;
        let mut base_cost = false;
        for token in parts {
            if token == "=" {
                if costs {
                    return Err(fail());
                }
                costs = true;
                base_cost = true;
                continue;
            }
            if base_cost {
                entry
                    .costs
                    .insert("".into(), token.parse().map_err(|_| fail())?);
                base_cost = false;
                continue;
            }
            let (key, value) = token.split_once(':').ok_or_else(fail)?;
            let value = value.parse().map_err(|_| fail())?;
            if costs {
                entry.costs.insert(key.into(), value);
            } else {
                entry.count.insert(key.into(), value);
            }
        }
        if base_cost {
            return Err(fail());
        }
        let existing = result.entry(id.into()).or_default();
        for (key, value) in entry.count {
            let v = existing.count.entry(key).or_default();
            *v = v.checked_add(value).ok_or_else(fail)?;
        }
        existing.costs.extend(entry.costs);
    }
    if result.is_empty() {
        return Err("В файле нет карт".into());
    }
    Ok(result)
}
pub fn write_collection(collection: &BTreeMap<String, CollectionEntry>) -> String {
    collection
        .iter()
        .map(|(id, e)| {
            let mut line = format!("{id} {}", e.count.get("").unwrap_or(&0));
            for (key, n) in &e.count {
                if !key.is_empty() {
                    line += &format!(" {key}:{n}");
                }
            }
            if !e.costs.is_empty() {
                line += &format!(" = {}", e.costs.get("").unwrap_or(&0));
                for (key, n) in &e.costs {
                    if !key.is_empty() {
                        line += &format!(" {key}:{n}");
                    }
                }
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n")
}
fn csv_cell(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}
pub fn collection_csv(user: &UserData, catalog: &Catalog) -> String {
    let mut lines = vec!["set_name;card_num;card_name;rarity;alt;count".into()];
    for (id, e) in &user.collection {
        if let Some(c) = catalog.get(id) {
            lines.push(format!(
                "{};{};{};{};{};{}",
                csv_cell(&catalog.set_name(c.set_id)),
                c.number,
                csv_cell(&c.name),
                csv_cell(&catalog.rarity_name(c.rarity)),
                csv_cell(&catalog.edition_name(c)),
                e.count.get("").unwrap_or(&0)
            ));
        }
    }
    format!("\u{feff}{}", lines.join("\n"))
}
const BASE64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
pub fn write_compact(deck: &Deck, catalog: &Catalog) -> String {
    let sets: Vec<_> = catalog.constants.sets.keys().collect();
    let mut out = String::from("#");
    for (side, list) in [(false, &deck.cards), (true, &deck.side)] {
        if side && !list.is_empty() {
            out.push_str("###");
        }
        for (id, mut count) in grouped(list) {
            if let Some(c) = catalog.get(&id) {
                let s = sets
                    .iter()
                    .position(|k| **k == c.set_id.to_string())
                    .unwrap_or(0);
                while count > 0 {
                    let n = count.min(7);
                    let value = (n << 15) | (s << 8) | c.number as usize;
                    for shift in [12, 6, 0] {
                        out.push(BASE64[(value >> shift) & 63] as char);
                    }
                    count -= n;
                }
            }
        }
    }
    out
}
pub fn read_compact(input: &str, catalog: &Catalog, id: String) -> Result<Deck, String> {
    let payload = input
        .trim()
        .strip_prefix('#')
        .ok_or("Код должен начинаться с #")?;
    if payload.is_empty() || !payload.len().is_multiple_of(3) || payload.len() > 30000 {
        return Err("Некорректный код колоды".into());
    }
    let sets: Vec<_> = catalog.constants.sets.keys().collect();
    let mut deck = Deck::new(id, "Колода из кода".into());
    let mut side = false;
    for chunk in payload.as_bytes().chunks(3) {
        if chunk == b"###" {
            side = true;
            continue;
        }
        let mut value = 0;
        for b in chunk {
            value = (value << 6)
                | BASE64
                    .iter()
                    .position(|c| c == b)
                    .ok_or("Неверный символ кода")?;
        }
        let count = (value >> 15) & 7;
        let set = sets.get((value >> 8) & 127).ok_or("Неизвестный набор")?;
        let id = format!("{}{:03}", set, value & 255);
        if count == 0 || catalog.get(&id).is_none() {
            return Err(format!("Неверная карта: {id}"));
        }
        for _ in 0..count {
            deck.add(&id, side);
        }
    }
    deck.validate_sets(catalog)?;
    Ok(deck)
}

/// Uses the upstream atlas layout (69 cards per 10×7 sheet).
pub fn write_tts(deck: &Deck, catalog: &Catalog) -> Result<String, String> {
    use serde_json::{Value, json};
    let opts = &catalog.constants.tts_options;
    let mut root = opts["root_base"].clone();
    let mut object = opts["deck_base"].clone();
    object["GUID"] = json!("b00000");
    object["Nickname"] = json!(deck.name);
    object["Description"] = json!(
        [
            deck.tags.join(", "),
            deck.description.clone(),
            deck.how_to_play.clone(),
            deck.improvements.clone()
        ]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
    );
    object["GMNotes"] = json!(serde_json::to_string(&json!({"berserk_deck_notes": {"allowed_sets":deck.allowed_sets,"description":deck.description,"how_to_play":deck.how_to_play,"improvements":deck.improvements}})).map_err(|e| e.to_string())?);
    let mut sheets = serde_json::Map::new();
    let mut cards = Vec::new();
    let mut ids = Vec::new();
    for (i, id) in deck.side.iter().chain(deck.cards.iter()).enumerate() {
        let card = catalog
            .get(id)
            .ok_or_else(|| format!("Неизвестная карта: {id}"))?;
        let sheet = card.set_id as u32 * 10 + (card.number as u32 - 1) / 69;
        let card_id = sheet * 100 + (card.number as u32 - 1) % 69;
        let set = card.set_id.to_string();
        if opts["unavailable_sets"]
            .as_array()
            .is_some_and(|sets| sets.iter().any(|id| id.as_str() == Some(&set)))
        {
            return Err(format!(
                "Для набора «{}» пока нет проверенных атласов Tabletop Simulator. Используйте экспорт .brsd.",
                catalog.set_name(card.set_id)
            ));
        }
        let path = opts["set_path"][&set]
            .as_str()
            .or(opts["path"].as_str())
            .ok_or("Нет адреса атласов")?;
        let suffix = opts["suffix"][&set].as_str().unwrap_or("");
        let mut sheet_data = opts["custom_view"].clone();
        sheet_data["FaceURL"] = json!(format!(
            "{path}{}-{}{suffix}.jpg",
            card.set_id,
            1 + (card.number - 1) / 69
        ));
        sheet_data["BackURL"] = json!(format!("{}back.jpg", opts["path"].as_str().unwrap_or(path)));
        sheets.insert(sheet.to_string(), sheet_data.clone());
        let mut item = opts["card_base"].clone();
        item["GUID"] = json!(format!("{:06x}", i + 1));
        item["CardID"] = json!(card_id);
        item["Nickname"] = json!(card.name);
        item["GMNotes"] = json!(format!("berserk-id:{}", card.id));
        let mut tags = vec![
            "Card".to_string(),
            catalog.rarity_name(card.rarity),
            catalog.color_name(card.color),
            catalog.set_name(card.set_id),
            format!("Cost_{}", card.cost),
            format!("Elite_{}", card.elite),
            format!("Uniq_{}", card.uniq),
        ];
        if i < deck.side.len() {
            tags.push("Side".into());
        }
        item["Tags"] = json!(tags);
        item["CustomDeck"] = json!({sheet.to_string():sheet_data});
        cards.push(item);
        ids.push(card_id);
    }
    if cards.is_empty() {
        return Err("В колоде нет карт".into());
    }
    object["DeckIDs"] = json!(ids);
    object["CustomDeck"] = Value::Object(sheets);
    object["ContainedObjects"] = json!(cards);
    if !deck.side.is_empty() {
        object["LuaScript"] = json!(
            "function onLoad()\n self.addContextMenuItem('Убрать сайд', function()\n local p = self.getPosition()\n for _, o in ipairs(self.getObjects()) do\n  for _, t in ipairs(o.tags or {}) do\n   if t == 'Side' then self.takeObject({guid=o.guid,position={p.x+5,p.y+2,p.z},smooth=false}) break end\n  end\n end\n end)\nend"
        );
    }
    root["ObjectStates"] = json!([object]);
    serde_json::to_string_pretty(&root).map_err(|e| e.to_string())
}
pub fn read_tts(input: &str, catalog: &Catalog, id: String) -> Result<Deck, String> {
    let data: serde_json::Value =
        serde_json::from_str(input).map_err(|e| format!("Неверный JSON TTS: {e}"))?;
    let root = data["ObjectStates"]
        .as_array()
        .and_then(|a| a.first())
        .ok_or("В TTS-файле нет объектов")?;
    let items = root["ContainedObjects"]
        .as_array()
        .ok_or("В TTS-файле нет колоды")?;
    if items.is_empty() || items.len() > 10000 {
        return Err("Неверное количество карт в TTS".into());
    }
    let mut deck = Deck::new(
        id,
        root["Nickname"]
            .as_str()
            .filter(|n| !n.is_empty())
            .unwrap_or("Колода TTS")
            .into(),
    );
    if let Some(notes) = root["GMNotes"]
        .as_str()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
    {
        deck.allowed_sets =
            serde_json::from_value(notes["berserk_deck_notes"]["allowed_sets"].clone())
                .map_err(|_| "Неверные разрешённые наборы TTS")?;
        deck.description = notes["berserk_deck_notes"]["description"]
            .as_str()
            .unwrap_or_default()
            .into();
        deck.how_to_play = notes["berserk_deck_notes"]["how_to_play"]
            .as_str()
            .unwrap_or_default()
            .into();
        deck.improvements = notes["berserk_deck_notes"]["improvements"]
            .as_str()
            .unwrap_or_default()
            .into();
    }
    for item in items {
        let name = item["Nickname"].as_str().unwrap_or("");
        let card = item["GMNotes"]
            .as_str()
            .and_then(|s| s.strip_prefix("berserk-id:"))
            .and_then(|id| catalog.get(id))
            .or_else(|| {
                catalog.cards.iter().rev().find(|c| {
                    c.alt.is_empty()
                        && deck.allows(c)
                        && normalize(c.name.trim()) == normalize(name.trim())
                })
            })
            .ok_or_else(|| format!("Неизвестная карта TTS: {name}"))?;
        let side = item["Tags"]
            .as_array()
            .is_some_and(|t| t.iter().any(|v| v == "Side"));
        deck.add(&card.id, side);
    }
    deck.validate_sets(catalog)?;
    Ok(deck)
}

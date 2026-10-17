use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Card {
    pub id: String,
    pub set_id: u16,
    pub number: u16,
    pub name: String,
    pub rarity: u8,
    pub cost: u16,
    pub elite: bool,
    pub uniq: bool,
    pub color: u8,
    #[serde(rename = "class")]
    pub classes: Vec<String>,
    #[serde(rename = "type")]
    pub kind: u8,
    pub life: Option<u16>,
    pub r#move: Option<u16>,
    pub hit: Option<Vec<u16>>,
    pub icons: BTreeMap<String, i16>,
    pub art: String,
    pub text: String,
    pub tokens: String,
    pub prints: BTreeMap<String, String>,
    pub alts: Vec<String>,
    #[serde(default)]
    pub missing_art: Vec<String>,
    pub fmt: String,
    #[serde(default)]
    pub horde: bool,
    #[serde(default)]
    pub ban: serde_json::Value,
    #[serde(default)]
    pub alt: String,
    #[serde(default)]
    pub base_id: String,
    #[serde(skip)]
    pub search: String,
}
impl Card {
    pub fn uses_base_art(&self) -> bool {
        self.missing_art.contains(&self.alt)
    }
    pub fn is_foil(&self) -> bool {
        matches!(
            self.alt.as_str(),
            "f" | "altf" | "alt_2f" | "fpf" | "altfpf" | "of" | "altof" | "n"
        )
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum EditionFilter {
    #[default]
    All,
    Base,
    Foil,
    Alternative,
    FullArt,
}
impl EditionFilter {
    pub fn matches(self, card: &Card) -> bool {
        match self {
            Self::All => true,
            Self::Base => card.alt.is_empty(),
            Self::Foil => card.is_foil(),
            Self::Alternative => card.alt.starts_with("alt"),
            Self::FullArt => card.alt.ends_with("pf"),
        }
    }
    pub fn value(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Base => "base",
            Self::Foil => "foil",
            Self::Alternative => "alternative",
            Self::FullArt => "full-art",
        }
    }
    pub fn from_value(value: &str) -> Self {
        match value {
            "base" => Self::Base,
            "foil" => Self::Foil,
            "alternative" => Self::Alternative,
            "full-art" => Self::FullArt,
            _ => Self::All,
        }
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct Constants {
    pub sets: BTreeMap<String, String>,
    pub sets_rotated: Vec<String>,
    pub rarities: BTreeMap<String, String>,
    pub colors: BTreeMap<String, String>,
    pub creature_types: BTreeMap<String, String>,
    pub alternatives: BTreeMap<String, String>,
    pub art_suffix: BTreeMap<String, String>,
    pub icons: BTreeMap<String, String>,
    pub tts_options: serde_json::Value,
}
#[derive(Clone, Debug)]
pub struct Catalog {
    pub cards: Vec<Card>,
    pub constants: Constants,
    index: BTreeMap<String, usize>,
    pub ratings: BTreeMap<String, Vec<f64>>,
    pub rankings: BTreeMap<String, Vec<u16>>,
}
pub fn normalize(s: &str) -> String {
    s.to_lowercase().replace('ё', "е")
}
impl Catalog {
    pub fn load() -> Result<Self, serde_json::Error> {
        let base: Vec<Card> = serde_json::from_str(include_str!("../data/cards.json"))?;
        let constants: Constants = serde_json::from_str(include_str!("../data/constants.json"))?;
        let mut cards = Vec::new();
        for mut card in base {
            card.base_id = card.id.clone();
            let bans = card.ban.clone();
            card.ban = bans
                .get("")
                .cloned()
                .unwrap_or(serde_json::Value::Bool(false));
            card.search = normalize(&format!(
                "{} {} {} {} {} {}",
                card.id,
                card.name,
                card.classes.join(" "),
                card.text,
                card.tokens,
                card.icons
                    .keys()
                    .filter_map(|k| constants.icons.get(k))
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ")
            ));
            cards.push(card.clone());
            for alt in &card.alts {
                let mut variant = card.clone();
                variant.alt = alt.clone();
                variant.id = format!("{}{}", card.id, alt);
                variant.search.push_str(&normalize(&format!(
                    " {} {}",
                    variant.id,
                    constants.alternatives.get(alt).unwrap_or(alt)
                )));
                variant.ban = bans.get(alt).cloned().unwrap_or_default();
                variant.prints.clear();
                cards.push(variant);
            }
        }
        let index = cards
            .iter()
            .enumerate()
            .map(|(i, c)| (c.id.clone(), i))
            .collect();
        Ok(Self {
            cards,
            constants,
            index,
            ratings: serde_json::from_str(include_str!("../data/karapet_score.json"))?,
            rankings: serde_json::from_str(include_str!("../data/motd_order.json"))?,
        })
    }
    pub fn set_ids(&self) -> Vec<u16> {
        self.constants
            .sets
            .keys()
            .filter_map(|id| id.parse().ok())
            .collect()
    }
    /// Scope the database before exposing it to a deck-building agent.
    pub fn restricted(&self, sets: Option<&[u16]>) -> Result<Self, String> {
        validate_allowed_sets(sets, self)?;
        let mut catalog = self.clone();
        catalog.cards.retain(|card| set_allowed(sets, card.set_id));
        catalog
            .constants
            .sets
            .retain(|id, _| id.parse().is_ok_and(|id| set_allowed(sets, id)));
        catalog.index = catalog
            .cards
            .iter()
            .enumerate()
            .map(|(i, c)| (c.id.clone(), i))
            .collect();
        Ok(catalog)
    }
    pub fn get(&self, id: &str) -> Option<&Card> {
        self.index.get(id).map(|&i| &self.cards[i])
    }
    pub fn image(&self, card: &Card) -> String {
        let suffix = if card.uses_base_art() {
            ""
        } else {
            self.constants
                .art_suffix
                .get(&card.alt)
                .unwrap_or(&card.alt)
        };
        format!(
            "public/cards/{}/{}{}.{}",
            card.set_id, card.number, suffix, card.fmt
        )
    }
    pub fn edition_name(&self, card: &Card) -> String {
        if card.alt.is_empty() {
            "Обычная".into()
        } else {
            self.constants
                .alternatives
                .get(&card.alt)
                .cloned()
                .unwrap_or_else(|| card.alt.clone())
        }
    }
    pub fn set_name(&self, id: u16) -> String {
        self.constants
            .sets
            .get(&id.to_string())
            .cloned()
            .unwrap_or_default()
    }
    pub fn color_name(&self, color: u8) -> String {
        self.constants
            .colors
            .get(&color.to_string())
            .cloned()
            .unwrap_or_else(|| "Несколько стихий".into())
    }
    pub fn rarity_name(&self, rarity: u8) -> String {
        self.constants
            .rarities
            .get(&rarity.to_string())
            .cloned()
            .unwrap_or_default()
    }
    pub fn rating(&self, c: &Card) -> f64 {
        self.ratings
            .get(&c.set_id.to_string())
            .and_then(|v| v.get(c.number as usize))
            .copied()
            .unwrap_or(0.0)
    }
    pub fn rank(&self, c: &Card) -> usize {
        self.rankings
            .get(&c.set_id.to_string())
            .and_then(|v| v.iter().position(|n| *n == c.number))
            .unwrap_or(1000)
    }
    pub fn rules_text(&self, c: &Card) -> String {
        let mut text = c.text.clone();
        for (key, value) in self
            .constants
            .icons
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .chain([
                ("tap", "[закрыть]"),
                ("counter", "[фишка]"),
                ("strike", "простой удар"),
                ("move", "движение"),
                ("instant", "внезапно"),
                ("life", "здоровье"),
                ("health", "здоровье"),
                ("ordinary", "серебряный кристалл"),
                ("elite", "золотой кристалл"),
                ("first", "первый игрок"),
                ("second", "второй игрок"),
                ("wolf", "форма зверя"),
                ("human", "форма человека"),
            ])
        {
            text = text.replace(&format!("{{{key}}}"), value);
        }
        text
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Filter {
    pub query: String,
    pub set: String,
    pub color: u8,
    pub rarity: u8,
    pub kind: String,
    pub class: String,
    pub elite: String,
    pub min_cost: Option<u16>,
    pub max_cost: Option<u16>,
    pub min_life: Option<u16>,
    pub owned: String,
    pub favorites: bool,
    pub edition: EditionFilter,
    pub standard: bool,
    pub sort: String,
}
impl Filter {
    pub fn apply<'a>(&self, catalog: &'a Catalog, user: &UserData) -> Vec<&'a Card> {
        let q = normalize(&self.query);
        let terms: Vec<_> = q.split_whitespace().collect();
        let mut result: Vec<_> = catalog
            .cards
            .iter()
            .filter(|c| {
                self.edition.matches(c)
                    && (self.set.is_empty() || c.set_id.to_string() == self.set)
                    && (self.color == 0 || c.color & self.color != 0)
                    && (self.rarity == 0 || c.rarity == self.rarity)
                    && (self.kind.is_empty() || c.kind.to_string() == self.kind)
                    && (self.class.is_empty() || c.classes.contains(&self.class))
                    && (self.elite.is_empty() || c.elite == (self.elite == "1"))
                    && self.min_cost.is_none_or(|n| c.cost >= n)
                    && self.max_cost.is_none_or(|n| c.cost <= n)
                    && self.min_life.is_none_or(|n| c.life.unwrap_or(0) >= n)
                    && (!self.standard
                        || !catalog
                            .constants
                            .sets_rotated
                            .contains(&c.set_id.to_string()))
                    && (!self.favorites || user.favorites.contains(&c.id))
                    && (match self.owned.as_str() {
                        "owned" => user.count(&c.id) > 0,
                        "missing" => user.count(&c.id) == 0,
                        _ => true,
                    })
                    && terms.iter().all(|t| c.search.contains(t))
            })
            .collect();
        result.sort_by(|a, b| {
            let order = match self.sort.as_str() {
                "name" => a.name.cmp(&b.name),
                "cost" => a.cost.cmp(&b.cost),
                "cost_desc" => b.cost.cmp(&a.cost),
                "life" => b.life.cmp(&a.life),
                "rarity" => b.rarity.cmp(&a.rarity),
                "color" => a.color.cmp(&b.color),
                "rating" => catalog.rating(b).total_cmp(&catalog.rating(a)),
                "motd" => catalog.rank(a).cmp(&catalog.rank(b)),
                _ => b.set_id.cmp(&a.set_id),
            };
            order.then(a.number.cmp(&b.number)).then(a.id.cmp(&b.id))
        });
        result
    }
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct CollectionEntry {
    #[serde(default)]
    pub count: BTreeMap<String, u32>,
    #[serde(default)]
    pub costs: BTreeMap<String, u32>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct DeckAgentSession {
    pub id: String,
    #[serde(default)]
    pub feedback: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Deck {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub how_to_play: String,
    #[serde(default)]
    pub improvements: String,
    /// None preserves unrestricted legacy decks; Some is an explicit, nonempty whitelist.
    #[serde(default)]
    pub allowed_sets: Option<Vec<u16>>,
    #[serde(default)]
    pub cards: Vec<String>,
    #[serde(default)]
    pub side: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_session: Option<DeckAgentSession>,
}
impl Deck {
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            description: String::new(),
            how_to_play: String::new(),
            improvements: String::new(),
            agent_session: None,
            allowed_sets: None,
            cards: vec![],
            side: vec![],
            tags: vec!["Констрактед".into()],
        }
    }
    pub fn allows(&self, card: &Card) -> bool {
        set_allowed(self.allowed_sets.as_deref(), card.set_id)
    }
    pub fn validate_sets(&self, catalog: &Catalog) -> Result<(), String> {
        validate_allowed_sets(self.allowed_sets.as_deref(), catalog)?;
        for id in self.cards.iter().chain(&self.side) {
            let card = catalog
                .get(id)
                .ok_or_else(|| format!("Неизвестная карта: {id}"))?;
            if !self.allows(card) {
                return Err(format!(
                    "{} ({id}): набор «{}» не разрешён для этой колоды. Уберите карту из колоды/запаса перед отключением набора.",
                    card.name,
                    catalog.set_name(card.set_id)
                ));
            }
        }
        Ok(())
    }
    pub fn add(&mut self, id: &str, side: bool) {
        if side {
            &mut self.side
        } else {
            &mut self.cards
        }
        .push(id.into());
    }
    pub fn remove(&mut self, id: &str, side: bool) {
        let list = if side {
            &mut self.side
        } else {
            &mut self.cards
        };
        if let Some(i) = list.iter().rposition(|c| c == id) {
            list.remove(i);
        }
    }
}
pub fn set_allowed(sets: Option<&[u16]>, id: u16) -> bool {
    sets.is_none_or(|sets| sets.contains(&id))
}
pub fn validate_allowed_sets(sets: Option<&[u16]>, catalog: &Catalog) -> Result<(), String> {
    if let Some(sets) = sets {
        if sets.is_empty() {
            return Err("Выберите хотя бы один разрешённый набор.".into());
        }
        let mut unique = BTreeSet::new();
        for id in sets {
            if !catalog.constants.sets.contains_key(&id.to_string()) {
                return Err(format!("Неизвестный или недоступный набор: {id}"));
            }
            if !unique.insert(id) {
                return Err(format!("Повторяющийся набор: {id}"));
            }
        }
    }
    Ok(())
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default)]
pub struct UserData {
    pub version: u32,
    pub collection: BTreeMap<String, CollectionEntry>,
    pub favorites: BTreeSet<String>,
    pub decks: Vec<Deck>,
    // Preserve old saves without retaining the removed draft engine.
    #[serde(rename = "draft", skip_serializing_if = "Option::is_none")]
    pub legacy_draft: Option<serde_json::Value>,
}
impl Default for UserData {
    fn default() -> Self {
        Self {
            version: 1,
            collection: BTreeMap::new(),
            favorites: BTreeSet::new(),
            decks: vec![],
            legacy_draft: None,
        }
    }
}
impl UserData {
    pub fn count(&self, id: &str) -> u32 {
        self.collection
            .get(id)
            .and_then(|e| e.count.get(""))
            .copied()
            .unwrap_or(0)
    }
    pub fn set_count(&mut self, id: &str, count: u32) {
        self.collection
            .entry(id.into())
            .or_default()
            .count
            .insert("".into(), count);
    }
    pub fn total(&self) -> u64 {
        self.collection
            .values()
            .map(|e| u64::from(*e.count.get("").unwrap_or(&0)))
            .sum()
    }
    pub fn validate(&self, catalog: &Catalog) -> Result<(), String> {
        if self.version != 1 {
            return Err("Неизвестная версия резервной копии".into());
        }
        for id in self.collection.keys().chain(self.favorites.iter()).chain(
            self.decks
                .iter()
                .flat_map(|d| d.cards.iter().chain(d.side.iter())),
        ) {
            if catalog.get(id).is_none() {
                return Err(format!("Неизвестная карта: {id}"));
            }
        }
        for deck in &self.decks {
            deck.validate_sets(catalog)?;
        }
        let mut ids = BTreeSet::new();
        if self
            .decks
            .iter()
            .any(|d| d.id.is_empty() || !ids.insert(&d.id) || d.cards.len() + d.side.len() > 10000)
        {
            return Err("Некорректный список колод".into());
        }
        Ok(())
    }
}
pub fn grouped(ids: &[String]) -> Vec<(String, usize)> {
    let mut result: Vec<(String, usize)> = vec![];
    for id in ids {
        if let Some(e) = result.iter_mut().find(|e| &e.0 == id) {
            e.1 += 1;
        } else {
            result.push((id.clone(), 1));
        }
    }
    result
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct Stats {
    pub total: usize,
    pub gold: u32,
    pub silver: u32,
    pub elite: usize,
    pub curve: BTreeMap<u16, usize>,
    pub colors: BTreeMap<u8, usize>,
}
impl Stats {
    pub fn of(ids: &[String], catalog: &Catalog) -> Self {
        let mut s = Self::default();
        for c in ids.iter().filter_map(|id| catalog.get(id)) {
            s.total += 1;
            if c.elite {
                s.elite += 1;
                s.gold += u32::from(c.cost);
            } else {
                s.silver += u32::from(c.cost);
            }
            *s.curve.entry(c.cost).or_default() += 1;
            *s.colors.entry(c.color).or_default() += 1;
        }
        s
    }
}
pub fn squad_budget(ids: &[String], catalog: &Catalog, second: bool, mulligans: u32) -> (i32, i32) {
    let s = Stats::of(ids, catalog);
    let colors = s.colors.keys().filter(|&&c| c != 32).count();
    let mut gold =
        24 + i32::from(second) - mulligans as i32 - colors.saturating_sub(1) as i32 - s.gold as i32;
    let mut silver = 22 + i32::from(second) - s.silver as i32;
    if silver < 0 {
        let paid = gold.max(0).min(-silver);
        gold -= paid;
        silver += paid;
    }
    (gold, silver)
}
pub fn squad_issues(ids: &[String], catalog: &Catalog) -> Vec<String> {
    let mut issues = vec![];
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut flying = 0;
    let mut lands = 0;
    for c in ids.iter().filter_map(|id| catalog.get(id)) {
        *counts.entry(c.base_id.clone()).or_default() += 1;
        if c.kind == 1 {
            flying += c.cost;
        }
        if c.kind == 5 {
            lands += 1;
        }
        if c.ban == true {
            issues.push(format!("{}: запрещена", c.name));
        }
    }
    for (id, count) in counts {
        if let Some(c) = catalog.get(&id) {
            let max = if c.uniq {
                1
            } else if c.horde {
                6
            } else {
                3
            };
            if count > max {
                issues.push(format!("{}: максимум {max}", c.name));
            }
        }
    }
    if flying > 15 {
        issues.push("Стоимость летающих существ превышает 15".into());
    }
    if lands > 1 {
        issues.push("В отряде не более одной местности".into());
    }
    issues
}

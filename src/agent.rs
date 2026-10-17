//! Shared, transport-independent contract for the local MCP/browser bridge.
use crate::model::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum BrowserCommand {
    Snapshot {},
    BuildProgress {
        progress: BuildProgress,
    },
    SaveDeck {
        deck: Deck,
        expected_revision: Option<String>,
        #[serde(default)]
        check_collection: bool,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case", deny_unknown_fields)]
pub enum BuildEvent {
    BuildDeck {
        request_id: String,
        size: u16,
        preferences: String,
        #[serde(default)]
        allowed_sets: Option<Vec<u16>>,
    },
    RefineDeck {
        request_id: String,
        deck_id: String,
        expected_revision: String,
        feedback: String,
        #[serde(default)]
        restart_session: bool,
    },
    CancelBuild {
        request_id: String,
    },
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BuildProgress {
    pub request_id: String,
    pub phase: String,
    pub message: String,
    pub deck_id: Option<String>,
}
impl BuildProgress {
    pub fn busy(&self) -> bool {
        matches!(self.phase.as_str(), "queued" | "running" | "saving")
    }
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BrowserRequest {
    pub id: String,
    pub command: BrowserCommand,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BrowserReply {
    pub id: String,
    pub result: Result<Value, String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub decks: Vec<Deck>,
    pub collection: BTreeMap<String, u32>,
}
impl From<&UserData> for Snapshot {
    fn from(user: &UserData) -> Self {
        Self {
            decks: user.decks.clone(),
            collection: user
                .collection
                .keys()
                .filter_map(|id| {
                    let count = user.count(id);
                    (count > 0).then(|| (id.clone(), count))
                })
                .collect(),
        }
    }
}
/// A stable change token, identical in native Rust and wasm. Not an auth token.
pub fn revision(deck: &Deck) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in serde_json::to_vec(deck).expect("Deck is serializable") {
        hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}
pub fn validate_shape(deck: &Deck, catalog: &Catalog) -> Result<(), String> {
    if deck.id.is_empty()
        || deck.id.len() > 128
        || deck.name.trim().is_empty()
        || deck.name.len() > 240
    {
        return Err("Deck needs a nonempty ID and name (max 128/240 bytes).".into());
    }
    if deck.cards.len() + deck.side.len() > 500
        || deck.tags.len() > 16
        || deck.tags.iter().any(|t| t.len() > 120)
    {
        return Err("Deck exceeds the agent limits (500 cards, 16 short tags).".into());
    }
    if deck.description.len() > 16_000
        || deck.how_to_play.len() > 32_000
        || deck.improvements.len() > 32_000
    {
        return Err("Description/how_to_play/improvements exceed 16000/32000/32000 bytes.".into());
    }
    if deck.agent_session.as_ref().is_some_and(|s| {
        s.id.len() > 128 || s.feedback.len() > 100 || s.feedback.iter().any(|f| f.len() > 8_000)
    }) {
        return Err("Deck conversation exceeds storage limits.".into());
    }
    deck.validate_sets(catalog)?;
    for id in deck.cards.iter().chain(&deck.side) {
        if catalog.get(id).is_none() {
            return Err(format!("Unknown card ID: {id}"));
        }
    }
    Ok(())
}
/// Only decks may be changed. Collection, favorites and opaque backup data survive intact.
pub fn apply_command(
    user: &mut UserData,
    catalog: &Catalog,
    command: BrowserCommand,
) -> Result<Value, String> {
    match command {
        BrowserCommand::BuildProgress { .. } => {
            Err("Progress is handled by the browser UI.".into())
        }
        BrowserCommand::Snapshot {} => Ok(json!(Snapshot::from(&*user))),
        BrowserCommand::SaveDeck {
            deck,
            expected_revision,
            check_collection,
        } => {
            validate_shape(&deck, catalog)?;
            if check_collection {
                let owned = Snapshot::from(&*user).collection;
                let report = deck_report(&deck, catalog, Some(&owned));
                if !report["missing_exact_editions"]
                    .as_array()
                    .is_some_and(Vec::is_empty)
                {
                    return Err(format!(
                        "Collection changed or insufficient owned cards: {}",
                        report["missing_exact_editions"]
                    ));
                }
            }
            let index = user.decks.iter().position(|d| d.id == deck.id);
            match (index, expected_revision.as_deref()) {
                (Some(i), Some(expected)) if revision(&user.decks[i]) == expected => {},
                (None, None) => {},
                _ => return Err("Conflict: deck changed or no longer exists. Read get_deck again before saving; use a new ID only for a new deck.".into()),
            }
            let result = json!({"deck":deck,"revision":revision(&deck),"saved":true});
            if let Some(i) = index {
                user.decks[i] = deck;
            } else {
                user.decks.insert(0, deck);
            }
            Ok(result)
        }
    }
}
/// Basic constructed checks, deliberately separate from squad-budget rules.
pub fn deck_report(
    deck: &Deck,
    catalog: &Catalog,
    collection: Option<&BTreeMap<String, u32>>,
) -> Value {
    let mut issues = Vec::new();
    if let Err(error) = deck.validate_sets(catalog) {
        issues.push(error);
    }
    if !(30..=50).contains(&deck.cards.len()) {
        issues.push("Constructed main deck must contain 30–50 cards.".to_string());
    }
    let mut names = BTreeMap::<String, usize>::new();
    for id in &deck.cards {
        if let Some(card) = catalog.get(id) {
            *names.entry(normalize(card.name.trim())).or_default() += 1;
        }
    }
    for (name, count) in names {
        if count > 3 {
            issues.push(format!("{name}: {count} copies; basic constructed limit is 3 across sets and editions (card-specific exceptions need manual review)."));
        }
    }
    for (id, _) in grouped(
        &deck
            .cards
            .iter()
            .chain(&deck.side)
            .cloned()
            .collect::<Vec<_>>(),
    ) {
        match catalog.get(&id) {
            None => issues.push(format!("Unknown card: {id}")),
            Some(card) if card.ban == true => issues.push(format!(
                "{} ({id}): marked banned in bundled catalog.",
                card.name
            )),
            _ => {}
        }
    }
    let s = Stats::of(&deck.cards, catalog);
    let missing = collection.map(|owned| {
        grouped(
            &deck
                .cards
                .iter()
                .chain(&deck.side)
                .cloned()
                .collect::<Vec<_>>(),
        )
        .into_iter()
        .filter_map(|(id, n)| {
            let count = owned.get(&id).copied().unwrap_or(0) as usize;
            (n > count).then(|| json!({"id":id,"needed":n,"owned":count,"missing":n-count}))
        })
        .collect::<Vec<_>>()
    });
    json!({"basic_constructed_ok":issues.is_empty(),"issues":issues,"main_count":deck.cards.len(),"side_count":deck.side.len(),"cost_curve":s.curve,"colors":s.colors,"gold_cost_total":s.gold,"silver_cost_total":s.silver,"missing_exact_editions":missing,"scope":"Basic main-deck size/copy checks plus bundled bans; not tournament certification. Sideboard, rotation, card-specific exceptions and current event rules require manual review. Squad restrictions are separate.","rules_source":"https://berserk.ru/pravila-igri"})
}

//! A run-local working deck. Only MCP operations mutate it; submitting is atomic.
use super::*;
use serde::Serialize;
use std::{collections::BTreeMap, path::PathBuf};

#[derive(Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub deck: Deck,
    pub collection: BTreeMap<String, u32>,
    pub size: u16,
    pub base_revision: Option<String>,
    pub submitted_revision: Option<String>,
    #[serde(default)]
    pub research: research::Audit,
}
impl Workspace {
    pub fn check_revision(&self, expected: &str) -> Result<(), String> {
        if revision(&self.deck) != expected {
            return Err(
                "Working deck changed. Call get_current_deck and retry with its revision.".into(),
            );
        }
        Ok(())
    }
    pub fn view(&self, cat: &Catalog) -> Value {
        let mut deck = self.deck.clone();
        deck.agent_session = None;
        json!({"deck":deck, "revision":revision(&self.deck), "target_size":self.size,
            "research":self.research,
            "report":deck_report(&self.deck,cat,Some(&self.collection)),
            "submitted":self.submitted_revision.as_deref()==Some(revision(&self.deck).as_str())})
    }
    pub fn validate_final(&self, cat: &Catalog) -> Result<(), String> {
        self.research.validate()?;
        validate_shape(&self.deck, cat)?;
        validate_player_text(&self.deck)?;
        let report = deck_report(&self.deck, cat, Some(&self.collection));
        if self.deck.cards.len() != usize::from(self.size)
            || report["basic_constructed_ok"] != true
            || !report["missing_exact_editions"]
                .as_array()
                .is_some_and(Vec::is_empty)
        {
            return Err(format!(
                "Fix the current deck before submitting: {report}. Target size: {}",
                self.size
            ));
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct Store {
    pub current: Option<Workspace>,
    pub path: Option<PathBuf>,
}
impl Store {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let workspace = serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Invalid deck workspace: {e}"))?;
        Ok(Self {
            current: Some(workspace),
            path: Some(path),
        })
    }
    pub fn get(&self) -> Result<&Workspace, String> {
        self.current
            .as_ref()
            .ok_or_else(|| "No current deck. Call begin_deck_edit first.".into())
    }
    pub fn replace(&mut self, workspace: Workspace) -> Result<(), String> {
        if let Some(path) = &self.path {
            let temporary = path.with_extension("tmp");
            std::fs::write(
                &temporary,
                serde_json::to_vec(&workspace).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            std::fs::rename(temporary, path).map_err(|e| e.to_string())?;
        }
        self.current = Some(workspace);
        Ok(())
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Begin {
    /// Existing saved deck; omit to create a new working deck.
    deck_id: Option<String>,
    /// Required when editing an existing saved deck.
    expected_revision: Option<String>,
    /// Required for new decks; existing decks keep their size.
    size: Option<u16>,
    /// New deck's allowed sets. Existing decks keep their restrictions.
    allowed_sets: Option<Vec<u16>>,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Revision {
    pub expected_revision: String,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CardCounts {
    expected_revision: String,
    /// Absolute main-deck counts for these exact editions. Zero removes a card.
    /// Unmentioned cards are preserved. Include removals and additions in one atomic batch.
    changes: Vec<Copies>,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Notes {
    expected_revision: String,
    name: Option<String>,
    description: Option<String>,
    how_to_play: Option<String>,
    improvements: Option<String>,
}

impl Workbench {
    pub async fn begin_edit(&self, args: Begin) -> Result<Value, String> {
        let mut store = self.editing.lock().await;
        if store.path.is_some() {
            return Err("This run already has a fixed working deck.".into());
        }
        if store.current.is_some() {
            return Err(
                "A working deck is already open. Save it or discard_deck_edit before switching."
                    .into(),
            );
        }
        let snapshot = self.bridge.snapshot().await?;
        let (deck, size, base_revision) = if let Some(id) = args.deck_id {
            let deck = snapshot
                .decks
                .into_iter()
                .find(|d| d.id == id)
                .ok_or("Deck not found")?;
            let rev = revision(&deck);
            if args.expected_revision.as_ref() != Some(&rev) {
                return Err("Saved deck changed; read get_deck first.".into());
            }
            if args.allowed_sets.is_some() || args.size.is_some() {
                return Err("Existing deck size and allowed sets cannot be changed here.".into());
            }
            let size = deck.cards.len().clamp(30, 50) as u16;
            (deck, size, Some(rev))
        } else {
            if args.expected_revision.is_some() {
                return Err("New decks have no expected_revision.".into());
            }
            let size = args.size.ok_or("Specify size for a new deck")?;
            if !(30..=50).contains(&size) {
                return Err("Deck size must be 30–50".into());
            }
            validate_allowed_sets(args.allowed_sets.as_deref(), &self.cat)?;
            let mut deck = Deck::new(Uuid::new_v4().to_string(), "Новая колода".into());
            deck.allowed_sets = args.allowed_sets;
            (deck, size, None)
        };
        let workspace = Workspace {
            deck,
            size,
            collection: snapshot.collection,
            base_revision,
            submitted_revision: None,
            research: research::Audit::default(),
        };
        let view = workspace.view(&self.cat);
        store.replace(workspace)?;
        Ok(view)
    }
    pub async fn current_deck(&self) -> Result<Value, String> {
        Ok(self.editing.lock().await.get()?.view(&self.cat))
    }
    pub async fn change_card_counts(&self, args: CardCounts) -> Result<Value, String> {
        let mut store = self.editing.lock().await;
        let mut workspace = store.get()?.clone();
        workspace.check_revision(&args.expected_revision)?;
        if args.changes.is_empty() || args.changes.len() > 100 {
            return Err("Supply 1–100 card count changes.".into());
        }
        let mut seen = std::collections::BTreeSet::new();
        for change in &args.changes {
            if !seen.insert(&change.id) {
                return Err("Duplicate card ID in changes.".into());
            }
            let card = self.cat.get(&change.id).ok_or("Unknown card ID")?;
            if change.count > 0 && (!workspace.deck.allows(card) || card.ban == true) {
                return Err("Cannot add banned cards or disabled sets.".into());
            }
            if change.count > 3 {
                return Err("Maximum three copies per name across editions.".into());
            }
        }
        for change in args.changes {
            workspace.deck.cards.retain(|id| id != &change.id);
            workspace
                .deck
                .cards
                .extend(std::iter::repeat_n(change.id, usize::from(change.count)));
        }
        validate_shape(&workspace.deck, &self.cat)?;
        if workspace.deck.cards.len() > usize::from(workspace.size) {
            return Err(
                "Main deck exceeds target size; include removals in the same batch.".into(),
            );
        }
        let mut counts = BTreeMap::<String, usize>::new();
        for id in &workspace.deck.cards {
            let card = self.cat.get(id).ok_or("Unknown card ID")?;
            *counts.entry(normalize(card.name.trim())).or_default() += 1;
        }
        if counts.values().any(|count| *count > 3) {
            return Err("Maximum three copies per name across editions.".into());
        }
        let report = deck_report(&workspace.deck, &self.cat, Some(&workspace.collection));
        if !report["missing_exact_editions"]
            .as_array()
            .is_some_and(Vec::is_empty)
        {
            return Err(format!(
                "Not enough owned copies (including reserve): {}",
                report["missing_exact_editions"]
            ));
        }
        workspace.submitted_revision = None;
        let view = workspace.view(&self.cat);
        store.replace(workspace)?;
        Ok(view)
    }
    pub async fn change_notes(&self, args: Notes) -> Result<Value, String> {
        let mut store = self.editing.lock().await;
        let mut workspace = store.get()?.clone();
        workspace.check_revision(&args.expected_revision)?;
        if let Some(text) = args.name {
            workspace.deck.name = text.trim().into();
        }
        if let Some(text) = args.description {
            workspace.deck.description = text;
        }
        if let Some(text) = args.how_to_play {
            workspace.deck.how_to_play = text;
        }
        if let Some(text) = args.improvements {
            workspace.deck.improvements = text;
        }
        validate_shape(&workspace.deck, &self.cat)?;
        workspace.submitted_revision = None;
        let view = workspace.view(&self.cat);
        store.replace(workspace)?;
        Ok(view)
    }
    pub async fn submit_deck(&self, args: Revision) -> Result<Value, String> {
        let mut store = self.editing.lock().await;
        let mut workspace = store.get()?.clone();
        workspace.check_revision(&args.expected_revision)?;
        workspace.validate_final(&self.cat)?;
        if store.path.is_some() {
            workspace.submitted_revision = Some(revision(&workspace.deck));
            let view = workspace.view(&self.cat);
            store.replace(workspace)?;
            return Ok(
                json!({"prepared":true,"current":view,"message":"Submitted to the app for final revision/ownership checks. Return your summary; the app will confirm the save."}),
            );
        }
        let saved = self
            .bridge
            .request(BrowserCommand::SaveDeck {
                deck: workspace.deck.clone(),
                expected_revision: workspace.base_revision.clone(),
                check_collection: true,
            })
            .await?;
        workspace.base_revision = Some(revision(&workspace.deck));
        workspace.submitted_revision = Some(revision(&workspace.deck));
        store.replace(workspace)?;
        Ok(json!({"saved":saved}))
    }
}

pub fn validate_player_text(deck: &Deck) -> Result<(), String> {
    if deck.description.trim().is_empty() || deck.how_to_play.trim().is_empty() {
        return Err("Заполните описание и план игры через set_deck_notes.".into());
    }
    for text in [
        &deck.name,
        &deck.description,
        &deck.how_to_play,
        &deck.improvements,
    ] {
        let lower = text.to_lowercase();
        if [
            "search_cards",
            "get_card",
            "catalog_info",
            "deal_deck",
            "save_deck",
            "validate_deck",
            "get_collection",
            "get_current_deck",
            "begin_deck_edit",
            "set_deck_card_counts",
            "set_deck_notes",
            "save_current_deck",
            "validate_current_deck",
            "search_proberserk_tournaments",
            "get_proberserk_tournament",
            "get_proberserk_deck",
            "analyze_proberserk_decks",
            "search_deck_memory",
            "remember_deck_insight",
            "missing_exact_editions",
            "owned_exact_edition",
            "allowed_sets",
            "berserk_catalog",
            "upgrade-catalog",
            ".json",
            "mcp",
            " cli",
            "json",
            "squad_indices",
        ]
        .iter()
        .any(|word| lower.contains(word))
        {
            return Err(
                "Codex добавил служебные подробности в текст колоды. Нужны только игровые советы."
                    .into(),
            );
        }
    }
    Ok(())
}

#[path = "support/codex.rs"]
mod codex;
#[path = "support/dealing.rs"]
mod dealing;
use dealing::DealInput;
// Native stdio MCP server. Browser storage is accessed only through a paired tab.
use axum::{
    Router,
    extract::{
        Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use berserk_leptos::{agent::*, formats, model::*};
use rmcp::{
    ServiceExt,
    handler::server::wrapper::Parameters,
    model::{CallToolResult, ContentBlock},
    schemars, tool, tool_router,
    transport::stdio,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, mpsc, oneshot};
use uuid::Uuid;

struct Job {
    request: BrowserRequest,
    reply: oneshot::Sender<Result<Value, String>>,
}
struct Bridge {
    client: Mutex<Option<mpsc::Sender<Job>>>,
    token: String,
    origin: String,
    port: u16,
    cat: Arc<Catalog>,
    build_tx: Mutex<Option<mpsc::Sender<BuildEvent>>>,
    build_progress: Mutex<BuildProgress>,
}
impl Bridge {
    async fn request(&self, command: BrowserCommand) -> Result<Value, String> {
        let tx = self.client.lock().await.clone().ok_or("No browser connected. Call connection_info and open its connect_url in the app's browser origin.")?;
        let (reply, receive) = oneshot::channel();
        let job = Job {
            request: BrowserRequest {
                id: Uuid::new_v4().to_string(),
                command,
            },
            reply,
        };
        tokio::time::timeout(Duration::from_secs(2), tx.send(job))
            .await
            .map_err(|_| "Browser request queue is busy")?
            .map_err(|_| "Browser disconnected")?;
        tokio::time::timeout(Duration::from_secs(15),receive).await.map_err(|_|"Browser reply timed out. A save may have completed: call get_deck/list_decks before retrying.")?.map_err(|_|"Browser disconnected; check the deck before retrying a save" )?
    }
    async fn snapshot(&self) -> Result<Snapshot, String> {
        serde_json::from_value(self.request(BrowserCommand::Snapshot {}).await?)
            .map_err(|e| e.to_string())
    }
}
#[derive(Deserialize)]
struct PairQuery {
    token: String,
}
async fn pair(
    State(bridge): State<Arc<Bridge>>,
    Query(query): Query<PairQuery>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if query.token != bridge.token
        || headers.get("origin").and_then(|h| h.to_str().ok()) != Some(bridge.origin.as_str())
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut slot = bridge.client.lock().await;
    if slot.as_ref().is_some_and(|tx| !tx.is_closed()) {
        return (
            StatusCode::CONFLICT,
            "A browser is already paired. Disconnect it first.",
        )
            .into_response();
    }
    let (tx, rx) = mpsc::channel(8);
    *slot = Some(tx);
    drop(slot);
    let (build_tx, build_rx) = mpsc::channel(8);
    *bridge.build_tx.lock().await = Some(build_tx);
    ws.max_message_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| browser_session(socket, rx, build_rx, bridge))
}
async fn browser_session(
    mut socket: WebSocket,
    mut jobs: mpsc::Receiver<Job>,
    mut builds: mpsc::Receiver<BuildEvent>,
    bridge: Arc<Bridge>,
) {
    let mut pending =
        std::collections::HashMap::<String, oneshot::Sender<Result<Value, String>>>::new();
    let mut running: Option<tokio::task::JoinHandle<()>> = None;
    loop {
        tokio::select! {
            job = jobs.recv() => {
                let Some(job) = job else { break; };
                if job.reply.is_closed() { continue; }
                pending.retain(|_,reply| !reply.is_closed());
                let payload = serde_json::to_string(&job.request).expect("Request is serializable");
                if socket.send(Message::Text(payload.into())).await.is_err() {break;}
                pending.insert(job.request.id,job.reply);
            }
            event = builds.recv() => {
                match event {
                    Some(BuildEvent::BuildDeck { request_id, size, preferences, allowed_sets }) => {
                        running = Some(tokio::spawn(codex::run(bridge.clone(),request_id,size,preferences,allowed_sets)));
                    }
                    Some(event @ BuildEvent::RefineDeck { .. }) => {
                        running = Some(tokio::spawn(codex::refine(bridge.clone(),event)));
                    }
                    Some(BuildEvent::CancelBuild { request_id }) => {
                        // Recheck after queueing: a proposal may already have entered save.
                        if bridge.build_progress.lock().await.phase != "saving" {
                            if let Some(task) = running.take() { task.abort(); let _ = task.await; }
                            let b = bridge.clone();
                            running = Some(tokio::spawn(async move {
                                let _ = b.progress(&request_id,"cancelled","Создание отменено.".into(),None).await;
                            }));
                        }
                    }
                    None => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(reply) = serde_json::from_str::<BrowserReply>(&text) {
                            if let Some(target) = pending.remove(&reply.id) { let _ = target.send(reply.result); }
                        } else if let Ok(event) = serde_json::from_str::<BuildEvent>(&text) {
                            let id = match &event { BuildEvent::BuildDeck {request_id,..} | BuildEvent::RefineDeck {request_id,..} | BuildEvent::CancelBuild {request_id} => request_id.clone() };
                            if let Err(error) = bridge.queue_build(event).await {
                                let current = bridge.build_progress.lock().await.clone();
                                let progress = if current.busy() {current} else {BuildProgress { request_id:id,phase:"failed".into(),message:error,deck_id:None }};
                                let request = BrowserRequest {id:Uuid::new_v4().to_string(),command:BrowserCommand::BuildProgress {progress}};
                                if socket.send(Message::Text(serde_json::to_string(&request).unwrap().into())).await.is_err() {break;}
                            }
                        } else {break;}
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {},
                    _ => break,
                }
            }
        }
    }
    if let Some(task) = running {
        task.abort();
        let _ = task.await;
    }
    let mut progress = bridge.build_progress.lock().await;
    if progress.busy() {
        progress.phase = "failed".into();
        progress.message = "Браузер отключён. Проверьте список колод перед повтором.".into();
    }
    let _ = socket.send(Message::Close(None)).await;
}

fn output(value: Result<Value, String>) -> CallToolResult {
    match value {
        Ok(value) => CallToolResult::structured(value),
        Err(error) => CallToolResult::error(vec![ContentBlock::text(error)]),
    }
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct Search {
    #[serde(default)]
    query: String,
    set_id: Option<u16>,
    /// Restrict all results to these sets. Omit for all available sets; empty lists are invalid.
    allowed_sets: Option<Vec<u16>>,
    /// Use a saved deck's allowed sets; explicit filters can only narrow them.
    deck_id: Option<String>,
    color: Option<u8>,
    rarity: Option<u8>,
    max_cost: Option<u16>,
    #[serde(default)]
    include_editions: bool,
    #[serde(default)]
    owned_only: bool,
    #[serde(default)]
    offset: usize,
    limit: Option<usize>,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct Id {
    id: String,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct CardQuery {
    id: String,
    /// Saved deck context; rejects cards from its disabled sets.
    deck_id: Option<String>,
    allowed_sets: Option<Vec<u16>>,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct BuildPrompt {
    /// Desired constructed main-deck size, 30–50. Defaults to 30.
    size: Option<u16>,
    /// Preferred elements, strategy, key cards and experience level.
    #[serde(default)]
    preferences: String,
    /// Allowed set IDs for the deck AND upgrade research. Omit for all sets.
    allowed_sets: Option<Vec<u16>>,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct RefineInput {
    deck_id: String,
    expected_revision: String,
    feedback: String,
    #[serde(default)]
    restart_session: bool,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct Copies {
    id: String,
    count: u16,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct DeckInput {
    name: String,
    /// Strategy, key synergies and weaknesses. Omitted fields are preserved on updates.
    description: Option<String>,
    /// Recruitment, deployment, opening moves and matchup advice.
    how_to_play: Option<String>,
    /// Optional upgrades using unowned cards, with replacements and reasons. Never adds cards to the deck.
    improvements: Option<String>,
    /// Allowed set IDs. Omitted/null preserves the setting on updates; new decks default to all sets.
    allowed_sets: Option<Vec<u16>>,
    cards: Vec<Copies>,
    #[serde(default)]
    side: Vec<Copies>,
    #[serde(default)]
    tags: Vec<String>,
    /// Omit to create. For an update, pass the ID and revision from get_deck.
    deck_id: Option<String>,
    expected_revision: Option<String>,
    /// Check exact owned editions in validation and enforce ownership atomically on save.
    #[serde(default)]
    check_collection: bool,
}
impl DeckInput {
    fn deck(&self) -> Result<Deck, String> {
        let mut deck = Deck::new(
            self.deck_id
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            self.name.trim().to_string(),
        );
        for (list, side) in [(&self.cards, false), (&self.side, true)] {
            for c in list {
                if c.count == 0 || deck.cards.len() + deck.side.len() + usize::from(c.count) > 500 {
                    return Err(
                        "Counts must be positive; maximum 500 cards including sideboard.".into(),
                    );
                }
                for _ in 0..c.count {
                    deck.add(&c.id, side);
                }
            }
        }
        if !self.tags.is_empty() {
            deck.tags = self.tags.clone();
        }
        deck.allowed_sets = self.allowed_sets.clone();
        deck.description = self.description.clone().unwrap_or_default();
        deck.how_to_play = self.how_to_play.clone().unwrap_or_default();
        deck.improvements = self.improvements.clone().unwrap_or_default();
        Ok(deck)
    }
}
#[derive(Clone)]
struct Workbench {
    cat: Arc<Catalog>,
    bridge: Arc<Bridge>,
}
impl Workbench {
    fn card(&self, c: &Card, owned: Option<u32>) -> Value {
        json!({"id":c.id,"base_id":c.base_id,"name":c.name,"set_id":c.set_id,"set":self.cat.set_name(c.set_id),"edition":self.cat.edition_name(c),"foil":c.is_foil(),"rarity":c.rarity,"color":c.color,"cost":c.cost,"elite":c.elite,"unique":c.uniq,"type":c.kind,"classes":c.classes,"life":c.life,"move":c.r#move,"hit":c.hit,"rules":self.cat.rules_text(c),"banned":c.ban,"owned_exact_edition":owned})
    }
}
#[tool_router(server_handler)]
impl Workbench {
    #[tool(
        description = "Continue this deck's local Codex conversation using player feedback. Requires deck_id and current expected_revision from get_deck. Updates the same deck, preserving allowed sets and sideboard; uses only owned cards. Set restart_session=true to start fresh if the old local conversation is unavailable. Poll get_deck_build_status.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            open_world_hint = true
        )
    )]
    async fn refine_deck_with_codex(
        &self,
        Parameters(args): Parameters<RefineInput>,
    ) -> CallToolResult {
        output(
            self.bridge
                .queue_build(BuildEvent::RefineDeck {
                    request_id: Uuid::new_v4().to_string(),
                    deck_id: args.deck_id,
                    expected_revision: args.expected_revision,
                    feedback: args.feedback,
                    restart_session: args.restart_session,
                })
                .await,
        )
    }
    #[tool(
        description = "Shuffle a proposed or saved 30–50-card main deck and draw 15 cards without replacement. Omit seed for independent sample hands; use the returned seed and squad_indices to assess a chosen squad's first/second-player budget and basic legality. Respects allowed sets. Check at least five final-deck hands; samples do not prove balance.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn deal_deck(&self, Parameters(args): Parameters<DealInput>) -> CallToolResult {
        output(self.deal(args).await)
    }
    #[tool(
        description = "Prepare the same collection-only Codex deck-building prompt as the app UI. Includes the requested deckbuilding article, card research workflow, description/how_to_play/improvements requirements and validation/save instructions. Does not generate or save a deck by itself.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn get_deck_build_prompt(&self, Parameters(args): Parameters<BuildPrompt>) -> CallToolResult {
        if let Err(error) = validate_allowed_sets(args.allowed_sets.as_deref(), &self.cat) {
            return output(Err(error));
        }
        output(berserk_leptos::deck_prompt::deck_build_prompt(args.size.unwrap_or(30), &args.preferences, args.allowed_sets.as_deref())
            .map(|prompt| json!({"prompt":prompt,"article_url":berserk_leptos::deck_prompt::ARTICLE_URL})) )
    }
    #[tool(
        description = "Start local Codex CLI to create and save a new collection-only deck with description, how_to_play and optional unowned-card improvements. Requires a paired browser and installed/authenticated Codex CLI. Returns immediately; poll get_deck_build_status. Only one run at a time.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            open_world_hint = true
        )
    )]
    async fn create_deck_with_codex(
        &self,
        Parameters(args): Parameters<BuildPrompt>,
    ) -> CallToolResult {
        output(
            self.bridge
                .queue_build(BuildEvent::BuildDeck {
                    request_id: Uuid::new_v4().to_string(),
                    size: args.size.unwrap_or(30),
                    preferences: args.preferences,
                    allowed_sets: args.allowed_sets,
                })
                .await,
        )
    }
    #[tool(
        description = "Read the current local Codex deck-generation job: request_id, phase, message, and saved deck_id. Do not retry a failed save before checking list_decks.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_deck_build_status(&self) -> CallToolResult {
        output(Ok(json!(&*self.bridge.build_progress.lock().await)))
    }
    #[tool(
        description = "Cancel a running Codex deck generation by request ID (id). Once saving has started, wait and use app Undo instead.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            open_world_hint = false
        )
    )]
    async fn cancel_deck_build(&self, Parameters(args): Parameters<Id>) -> CallToolResult {
        output(
            self.bridge
                .queue_build(BuildEvent::CancelBuild {
                    request_id: args.id,
                })
                .await,
        )
    }
    #[tool(
        description = "Get the local browser pairing URL and connection status. Open connect_url in the browser containing the user's collection. A single tab can pair. Token lasts only for this server process. No browser is needed for catalog search or basic validation.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn connection_info(&self) -> CallToolResult {
        let connected = self
            .bridge
            .client
            .lock()
            .await
            .as_ref()
            .is_some_and(|tx| !tx.is_closed());
        output(Ok(
            json!({"connected":connected,"connect_url":format!("{}/#agent={}:{}",self.bridge.origin,self.bridge.port,self.bridge.token),"instructions":"Open this URL in the app browser, then use get_collection/list_decks. Saves appear immediately in My decks and can be undone in the app."}),
        ))
    }
    #[tool(
        description = "Get catalog sets, elements, rarity IDs and deck-building guidance. IDs are strings; do not invent card IDs. Search, inspect rules, validate a proposal, then save_deck.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn catalog_info(&self) -> CallToolResult {
        output(Ok(
            json!({"sets":self.cat.constants.sets,"colors":self.cat.constants.colors,"rarities":self.cat.constants.rarities,"types":self.cat.constants.creature_types,"card_records":self.cat.cards.len(),"workflow":["connection_info: pair browser for collection and saves","search_cards: find IDs (owned_only requires browser)","get_card: inspect rules","validate_deck: check a complete proposal","save_deck: persist a new deck or revision-checked update"],"rules_source":"https://berserk.ru/pravila-igri","notes":"Basic constructed: 30–50 main cards, normally at most 3 cards of one name across editions/sets. Squad budget and unique restrictions are NOT deck restrictions. Current format legality/card exceptions require manual review. Incomplete drafts may be saved."}),
        ))
    }
    #[tool(
        description = "Search bundled cards by Russian/English text, set, element bitmask, rarity and maximum cost. Pass deck_id for a saved deck, or allowed_sets for a new proposal; disabled sets are excluded before pagination. Base editions by default. Pagination limit 1–100. Set include_editions=true with owned_only to include owned foil and alternate editions.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn search_cards(&self, Parameters(args): Parameters<Search>) -> CallToolResult {
        output(async {
            let limit=args.limit.unwrap_or(30);
            if !(1..=100).contains(&limit) {return Err("limit must be 1–100".into());}
            validate_allowed_sets(args.allowed_sets.as_deref(), &self.cat)?;
            let snapshot=if args.owned_only || args.deck_id.is_some() {Some(self.bridge.snapshot().await?)}else{None};
            let deck = if let Some(id) = &args.deck_id { Some(snapshot.as_ref().unwrap().decks.iter().find(|d| &d.id == id).ok_or("Deck not found")?) } else { None };
            let deck_sets = deck.and_then(|d| d.allowed_sets.as_deref());
            if args.allowed_sets.as_ref().is_some_and(|sets| sets.iter().any(|id| !set_allowed(deck_sets, *id))) { return Err("Search requests a disabled deck set".into()); }
            if args.set_id.is_some_and(|id| !self.cat.constants.sets.contains_key(&id.to_string()) || !set_allowed(args.allowed_sets.as_deref(), id) || !set_allowed(deck_sets, id)) { return Err("Search requests a disabled or unknown set".into()); }
            let mut user=UserData::default();
            if let Some(s)=&snapshot {for (id,count) in &s.collection {user.set_count(id,*count);}}
            let filter=Filter{query:args.query,set:args.set_id.map(|n|n.to_string()).unwrap_or_default(),color:args.color.unwrap_or(0),rarity:args.rarity.unwrap_or(0),max_cost:args.max_cost,edition:if args.include_editions {EditionFilter::All}else{EditionFilter::Base},owned:if args.owned_only {"owned".into()}else{String::new()},..Default::default()};
            let found: Vec<_>=filter.apply(&self.cat,&user).into_iter().filter(|c| set_allowed(args.allowed_sets.as_deref(), c.set_id) && set_allowed(deck_sets, c.set_id)).collect();
            let cards:Vec<_>=found.iter().skip(args.offset).take(limit).map(|c|self.card(c,snapshot.as_ref().map(|s|s.collection.get(&c.id).copied().unwrap_or(0)))).collect();
            Ok(json!({"total":found.len(),"offset":args.offset,"next_offset":(args.offset.saturating_add(limit)<found.len()).then_some(args.offset.saturating_add(limit)),"cards":cards}))
        }.await)
    }
    #[tool(
        description = "Read a card's exact rules and edition by ID. Pass deck_id or allowed_sets to enforce deck restrictions.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_card(&self, Parameters(args): Parameters<CardQuery>) -> CallToolResult {
        output(
            async {
                validate_allowed_sets(args.allowed_sets.as_deref(), &self.cat)?;
                let card = self
                    .cat
                    .get(&args.id)
                    .ok_or_else(|| format!("Unknown or disabled card: {}", args.id))?;
                if !set_allowed(args.allowed_sets.as_deref(), card.set_id) {
                    return Err("Card belongs to a disabled set".into());
                }
                if let Some(id) = args.deck_id {
                    let snapshot = self.bridge.snapshot().await?;
                    let deck = snapshot
                        .decks
                        .iter()
                        .find(|d| d.id == id)
                        .ok_or("Deck not found")?;
                    if !deck.allows(card) {
                        return Err("Card belongs to a disabled deck set".into());
                    }
                }
                Ok(self.card(card, None))
            }
            .await,
        )
    }

    #[tool(
        description = "Read positive owned counts from the paired browser, by exact edition ID. Does not expose collection prices or change collection data.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_collection(&self) -> CallToolResult {
        output(self.bridge.snapshot().await.map(|s|json!({"collection":s.collection,"count_semantics":"Exact edition quantities; other decks do not reserve copies. Use search_cards owned_only=true/include_editions=true for card details."})))
    }
    #[tool(
        description = "List decks saved in the paired app, with IDs and change revisions.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_decks(&self) -> CallToolResult {
        output(self.bridge.snapshot().await.map(|s|json!({"decks":s.decks.iter().map(|d|json!({"id":d.id,"name":d.name,"main_count":d.cards.len(),"side_count":d.side.len(),"allowed_sets":d.allowed_sets,"revision":revision(d)})).collect::<Vec<_>>()})))
    }
    #[tool(
        description = "Read a complete saved deck and its expected_revision token for safe updates. Includes validation, owned-card shortages and portable text export.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_deck(&self, Parameters(args): Parameters<Id>) -> CallToolResult {
        output(async {let s=self.bridge.snapshot().await?;let d=s.decks.iter().find(|d|d.id==args.id).ok_or("Deck not found")?;Ok(json!({"deck":d,"revision":revision(d),"report":deck_report(d,&self.cat,Some(&s.collection)),"export_text":formats::write_deck(d,&self.cat,false)}))}.await)
    }
    #[tool(
        description = "Validate a proposed deck without saving it. cards/side are arrays of {id,count}. Checks basic constructed size/copy limits (by name across sets/editions), bundled bans, cost curve and optional exact-edition collection shortages. Does not certify tournament legality.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn validate_deck(&self, Parameters(args): Parameters<DeckInput>) -> CallToolResult {
        output(
            async {
                let mut deck = args.deck()?;
                let s = if args.check_collection || args.deck_id.is_some() {
                    Some(self.bridge.snapshot().await?)
                } else {
                    None
                };
                if let Some(id) = &args.deck_id {
                    let previous = s
                        .as_ref()
                        .unwrap()
                        .decks
                        .iter()
                        .find(|d| &d.id == id)
                        .ok_or("Deck not found")?;
                    if args.allowed_sets.is_none() {
                        deck.allowed_sets = previous.allowed_sets.clone();
                    }
                }
                validate_shape(&deck, &self.cat)?;
                Ok(deck_report(
                    &deck,
                    &self.cat,
                    s.as_ref().map(|s| &s.collection),
                ))
            }
            .await,
        )
    }
    #[tool(
        description = "Create or update a deck in the paired browser and open it in My decks. Notes description/how_to_play/improvements support Markdown; use [card:ID] for clickable database card names, with verified exact IDs. Supply the complete cards and side arrays as {id,count}. Omit deck_id/revision for a new deck. Updating REQUIRES deck_id and expected_revision from get_deck; concurrent UI edits are rejected. Unknown IDs and cards outside allowed_sets (including sideboard) are rejected; incomplete drafts are allowed. Omitted allowed_sets is preserved on updates. Never changes collection counts. Saved changes can be undone in the app. On timeout inspect list_decks before retrying.",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn save_deck(&self, Parameters(args): Parameters<DeckInput>) -> CallToolResult {
        output(async {
            if args.deck_id.is_some()!=args.expected_revision.is_some() {return Err("Updates require both deck_id and expected_revision; creates require neither.".into());}
            let mut deck=args.deck()?;
            validate_shape(&deck, &self.cat)?;
            let snapshot = self.bridge.snapshot().await?;
            if let Some(id) = &args.deck_id {
                let previous = snapshot.decks.iter().find(|d| &d.id == id).ok_or("Deck not found")?;
                deck.agent_session = previous.agent_session.clone();
                if args.allowed_sets.is_none() { deck.allowed_sets = previous.allowed_sets.clone(); }
                if args.description.is_none() { deck.description = previous.description.clone(); }
                if args.how_to_play.is_none() { deck.how_to_play = previous.how_to_play.clone(); }
                if args.improvements.is_none() { deck.improvements = previous.improvements.clone(); }
            }
            validate_shape(&deck,&self.cat)?;
            let report=deck_report(&deck,&self.cat, args.check_collection.then_some(&snapshot.collection));
            let saved=self.bridge.request(BrowserCommand::SaveDeck{deck,expected_revision:args.expected_revision,check_collection:args.check_collection}).await?;
            Ok(json!({"saved":saved,"report":report}))
        }.await)
    }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // The deck-building CLI gets the full database over stdio MCP. This mode
    // exposes no browser mutations and needs no extra listener or pairing step.
    if std::env::args().any(|arg| arg == "--catalog-only") {
        let catalog = Catalog::load()?;
        let arguments: Vec<_> = std::env::args().collect();
        let allowed_sets: Option<Vec<u16>> =
            match arguments.iter().position(|a| a == "--allowed-sets") {
                Some(i) => Some(serde_json::from_str(
                    arguments
                        .get(i + 1)
                        .ok_or("--allowed-sets requires a JSON array")?,
                )?),
                None => None,
            };
        let cat = Arc::new(catalog.restricted(allowed_sets.as_deref())?);
        let bridge = Arc::new(Bridge {
            client: Mutex::new(None),
            token: String::new(),
            origin: String::new(),
            port: 0,
            cat: cat.clone(),
            build_tx: Mutex::new(None),
            build_progress: Mutex::new(BuildProgress::default()),
        });
        let service = CatalogServer {
            workbench: Workbench { cat, bridge },
        }
        .serve(stdio())
        .await?;
        service.waiting().await?;
        return Ok(());
    }
    let desktop = std::env::args().any(|arg| arg == "--app");
    let port = if desktop {
        std::env::var("BERSERK_DESKTOP_PORT")
            .unwrap_or_else(|_| "47381".into())
            .parse::<u16>()?
    } else {
        0
    };
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let app_origin = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
    let origin = if desktop {
        app_origin
    } else {
        std::env::var("BERSERK_APP_ORIGIN")
            .unwrap_or_else(|_| "http://127.0.0.1:8080".into())
            .trim_end_matches('/')
            .to_string()
    };
    let uri: axum::http::Uri = origin.parse()?;
    if uri.scheme_str() != Some("http")
        || !matches!(uri.host(), Some("localhost" | "127.0.0.1"))
        || uri.path() != "/"
        || uri.query().is_some()
    {
        return Err("BERSERK_APP_ORIGIN must be a local http://127.0.0.1:PORT or http://localhost:PORT origin".into());
    }
    let cat = Arc::new(Catalog::load()?);
    let bridge = Arc::new(Bridge {
        port: listener.local_addr()?.port(),
        origin,
        token: Uuid::new_v4().simple().to_string(),
        client: Mutex::new(None),
        cat: cat.clone(),
        build_tx: Mutex::new(None),
        build_progress: Mutex::new(BuildProgress::default()),
    });
    let mut routes = Router::new()
        .route("/bridge", get(pair))
        .with_state(bridge.clone());
    if desktop {
        let assets = std::env::var("BERSERK_WEB_ROOT")?;
        if !std::path::Path::new(&assets).join("index.html").is_file() {
            return Err("Bundled web interface is missing".into());
        }
        let host = format!("127.0.0.1:{}", bridge.port);
        routes = routes
            .fallback_service(tower_http::services::ServeDir::new(assets))
            .layer(axum::middleware::from_fn(
                move |request: axum::extract::Request, next: axum::middleware::Next| {
                    let host = host.clone();
                    async move {
                        if request.headers().get("host").and_then(|h| h.to_str().ok())
                            != Some(host.as_str())
                        {
                            return StatusCode::FORBIDDEN.into_response();
                        }
                        let mut response = next.run(request).await;
                        response
                            .headers_mut()
                            .insert("x-content-type-options", "nosniff".parse().unwrap());
                        response.headers_mut().insert(
                            "content-security-policy",
                            "frame-ancestors 'none'; frame-src 'none'".parse().unwrap(),
                        );
                        response
                    }
                },
            ));
    }
    let http = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, routes).await {
            eprintln!("Local browser bridge failed: {e}");
        }
    });
    let workbench = Workbench { cat, bridge };
    if desktop {
        use std::io::Write;
        println!(
            "{}",
            json!({"origin":workbench.bridge.origin,"port":workbench.bridge.port,"token":workbench.bridge.token})
        );
        std::io::stdout().flush()?;
        // The native parent owns this pipe. EOF also stops the service after a parent crash.
        let (closed, closing) = oneshot::channel();
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buffer = [0u8; 64];
            while std::io::stdin().read(&mut buffer).is_ok_and(|n| n > 0) {}
            let _ = closed.send(());
        });
        #[cfg(unix)]
        {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
            tokio::select! { _ = closing => {}, _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
        }
        #[cfg(not(unix))]
        tokio::select! { _ = closing => {}, _ = tokio::signal::ctrl_c() => {} }
        http.abort();
        return Ok(());
    }
    if std::env::args().any(|arg| arg == "--serve") {
        println!(
            "Open {}/#agent={}:{}",
            workbench.bridge.origin, workbench.bridge.port, workbench.bridge.token
        );
        tokio::signal::ctrl_c().await?;
        http.abort();
        return Ok(());
    }
    eprintln!("Berserk MCP ready. Use connection_info to pair the local browser.");
    let service = workbench.serve(stdio()).await?;
    service.waiting().await?;
    http.abort();
    Ok(())
}

struct CatalogServer {
    workbench: Workbench,
}

#[tool_router(server_handler)]
impl CatalogServer {
    #[tool(
        description = "Draw 15 cards without replacement from a proposed 30–50-card main deck supplied as cards=[{id,count}]. Only allowed sets. Omit seed for fresh hands; reuse seed and identical cards with squad_indices (zero-based) to check recruitment budgets and basic squad rules. Check at least five independent final-deck hands. No browser or mutations; deck_id is unavailable here.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn deal_deck(&self, Parameters(args): Parameters<DealInput>) -> CallToolResult {
        output(self.workbench.deal(args).await)
    }

    #[tool(
        description = "Read metadata for the complete bundled Berserk database: sets, elements, rarity, types and total records. Only the allowed sets returned here are searchable; no browser pairing is needed.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    fn catalog_info(&self) -> CallToolResult {
        let cat = &self.workbench.cat;
        output(Ok(
            json!({"sets":cat.constants.sets,"colors":cat.constants.colors,"rarities":cat.constants.rarities,"types":cat.constants.creature_types,"card_records":cat.cards.len(),"notes":"Bundled catalog scoped to the deck allowed sets, not a preselected upgrade list. Disabled sets cannot be searched or read. Use search_cards with pagination and get_card to verify rules. Owned quantities are supplied in the deck-building prompt. Bans are bundled data, not a certification of current tournament legality."}),
        ))
    }

    #[tool(
        description = "Search Berserk cards in the allowed sets of the bundled database, by Russian/English rules text, names, classes, element bitmask, set, rarity or cost. Base editions by default; include_editions=true adds foil/alternate records. Use offset/next_offset to paginate; limit 1–100. owned_only must be false: compare results with the collection in the prompt.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn search_cards(&self, args: Parameters<Search>) -> CallToolResult {
        if args.0.owned_only {
            return output(Err(
                "Use owned_only=false; the collection is supplied in your prompt.".into(),
            ));
        }
        self.workbench.search_cards(args).await
    }

    #[tool(
        description = "Read an allowed card's exact ID, name, edition, full rules, stats and bundled ban status from the complete Berserk database. Verify proposed upgrade cards here before recommending them.",
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn get_card(&self, args: Parameters<CardQuery>) -> CallToolResult {
        self.workbench.get_card(args).await
    }
}

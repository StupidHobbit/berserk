//! Persistent, source-backed deck research shared across otherwise isolated runs.
use super::{Workbench, proberserk as site};
use chrono::{Duration as Days, Utc};
use reqwest::{Client, Url};
use rmcp::schemars;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::sync::Mutex;

const MAX_PAGE: usize = 2_000_000;
const MAX_MEMORY: u64 = 4_000_000;
const CACHE_SECONDS: i64 = 6 * 60 * 60;

fn unavailable(error: &str) -> bool {
    // Invalid IDs, malformed pages and storage failures must not waive research.
    [
        "ProBerserk request failed:",
        "ProBerserk HTTP 5",
        "ProBerserk HTTP 429",
        "ProBerserk HTTP 403",
    ]
    .iter()
    .any(|prefix| error.starts_with(prefix))
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Audit {
    pub required: bool,
    pub memory_reviewed: bool,
    pub discovery_attempted: bool,
    #[serde(default)]
    pub qualifying_events_found: bool,
    pub analyzed_decks: Vec<String>,
    pub saved_insights: Vec<String>,
    pub unavailable_reason: Option<String>,
}
impl Audit {
    pub fn required() -> Self {
        Self {
            required: true,
            ..Default::default()
        }
    }
    pub fn validate(&self) -> Result<(), String> {
        if !self.required {
            return Ok(());
        }
        if !self.memory_reviewed {
            return Err("Review search_deck_memory before submitting the deck.".into());
        }
        if !self.discovery_attempted {
            return Err(
                "Use search_proberserk_tournaments to research large events before submitting."
                    .into(),
            );
        }
        if self.unavailable_reason.is_none()
            && (self.analyzed_decks.len() < 2 || self.saved_insights.is_empty())
        {
            return Err("Compare at least two top-finishing decks with analyze_proberserk_decks, then preserve useful lessons with remember_deck_insight before submitting.".into());
        }
        Ok(())
    }
}

fn default_players() -> u32 {
    32
}
fn first_page() -> u32 {
    1
}
fn default_limit() -> usize {
    10
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SearchEvents {
    #[serde(default)]
    pub format: site::Format,
    /// Minimum reported attendance; defaults to 32. Lower explicitly when evidence is sparse.
    #[serde(default = "default_players")]
    pub min_players: u32,
    /// YYYY-MM-DD. Defaults to the last 365 days.
    pub from: Option<String>,
    /// YYYY-MM-DD. Defaults to today, excluding future-dated events.
    pub to: Option<String>,
    /// Site page (100 rows/page). Follow next_page even if the filtered page is empty.
    #[serde(default = "first_page")]
    pub page: u32,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Resource {
    pub url: String,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Analyze {
    /// Two to eight distinct deck URLs from inspected tournament standings, preferably multiple large events.
    pub deck_urls: Vec<String>,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Recall {
    #[serde(default)]
    pub query: String,
    pub format: Option<site::Format>,
    #[serde(default = "default_limit")]
    pub limit: usize,
    /// Include full numeric comparison tables. Omit for concise lesson recall.
    #[serde(default)]
    pub include_facts: bool,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Remember {
    /// Stable topic key; reuse it to revise an insight instead of creating duplicates.
    pub key: String,
    pub title: String,
    /// Concrete reusable strategy/interaction/constraint; distinguish observation from inference.
    pub lesson: String,
    /// When this lesson applies and when it should not be used (format, season, archetype).
    pub applicability: String,
    pub format: site::Format,
    /// Previously fetched tournament/deck URLs. Provenance dates are attached by the server.
    pub sources: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Evidence {
    url: String,
    fetched_at: i64,
    event_date: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct Insight {
    key: String,
    title: String,
    lesson: String,
    applicability: String,
    format: site::Format,
    allowed_sets: Vec<u16>,
    sources: Vec<Evidence>,
    updated_at: i64,
    kind: String,
    facts: Option<Value>,
}
#[derive(Serialize, Deserialize)]
struct Memory {
    version: u8,
    insights: BTreeMap<String, Insight>,
}
impl Default for Memory {
    fn default() -> Self {
        Self {
            version: 1,
            insights: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Source {
    version: u8,
    url: String,
    fetched_at: i64,
    data: Value,
}
struct Fetched {
    source: Source,
    cached: bool,
    stale: bool,
    warning: Option<String>,
}
impl Fetched {
    fn view(&self) -> Value {
        json!({"source_url":self.source.url,"fetched_at":self.source.fetched_at,"cached":self.cached,"stale":self.stale,"warning":self.warning,"data":self.source.data,"limitations":site::LIMITATIONS})
    }
}
pub struct Research {
    pub root: PathBuf,
    client: Client,
    last_request: Mutex<Option<tokio::time::Instant>>,
}

pub fn directory(args: &[String]) -> Result<PathBuf, String> {
    if let Some(i) = args.iter().position(|v| v == "--research-dir") {
        return args
            .get(i + 1)
            .filter(|p| !p.is_empty())
            .map(PathBuf::from)
            .ok_or_else(|| "--research-dir needs a path".into());
    }
    Ok(berserk_leptos::data_paths::data_dir()?.join("research"))
}
fn key(value: &str) -> String {
    let hash = value.bytes().fold(0xcbf29ce484222325u64, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}
fn read_json<T: serde::de::DeserializeOwned>(path: &Path, limit: u64) -> Result<Option<T>, String> {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Research data exceeds its size limit".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("Research data is corrupt; original preserved: {e}"))
}
fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_MEMORY {
        return Err(
            "Research memory is full; revise existing topics instead of adding duplicates".into(),
        );
    }
    let parent = path.parent().ok_or("Missing research directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(&bytes)
        .and_then(|_| tmp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(())
}

impl Research {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        let client = Client::builder()
            .user_agent("Berserk-Deck-Research/0.2 (public tournament research)")
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 3
                    || attempt.url().scheme() != "https"
                    || !matches!(
                        attempt.url().host_str(),
                        Some("proberserk.ru" | "www.proberserk.ru")
                    )
                    || attempt.url().port().is_some_and(|p| p != 443)
                {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            root,
            client,
            last_request: Mutex::new(None),
        })
    }
    fn cache_path(&self, url: &str) -> PathBuf {
        self.root.join("sources").join(format!("{}.json", key(url)))
    }
    fn cached(&self, url: &str) -> Result<Option<Source>, String> {
        let cached: Option<Source> = read_json(&self.cache_path(url), MAX_MEMORY)?;
        if cached
            .as_ref()
            .is_some_and(|s| s.version != 1 || s.url != url)
        {
            return Err("Research cache version/key mismatch".into());
        }
        Ok(cached)
    }
    async fn fetch(
        &self,
        url: &str,
        parse: impl Fn(&str) -> Result<Value, String>,
    ) -> Result<Fetched, String> {
        let cached = self.cached(url)?;
        let now = Utc::now().timestamp();
        if let Some(source) = cached
            .as_ref()
            .filter(|s| (0..CACHE_SECONDS).contains(&(now - s.fetched_at)))
        {
            return Ok(Fetched {
                source: source.clone(),
                cached: true,
                stale: false,
                warning: None,
            });
        }
        let downloaded = async {
            // Serialize and pace requests; never crawl images, private pages or arbitrary URLs.
            let mut last = self.last_request.lock().await;
            if let Some(previous) = *last {
                tokio::time::sleep_until(previous + Duration::from_millis(600)).await;
            }
            *last = Some(tokio::time::Instant::now());
            let mut response = self
                .client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("ProBerserk request failed: {e}"))?;
            if !response.status().is_success() {
                return Err(format!("ProBerserk HTTP {}", response.status()));
            }
            if response
                .content_length()
                .is_some_and(|n| n > MAX_PAGE as u64)
            {
                return Err("ProBerserk page too large".into());
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| format!("ProBerserk request failed: {e}"))?
            {
                if bytes.len() + chunk.len() > MAX_PAGE {
                    return Err("ProBerserk page too large".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            let body = String::from_utf8(bytes).map_err(|_| "ProBerserk returned invalid UTF-8")?;
            parse(&body)
        }
        .await;
        match downloaded {
            Ok(data) => {
                let source = Source {
                    version: 1,
                    url: url.into(),
                    fetched_at: now,
                    data,
                };
                atomic_json(&self.cache_path(url), &source)?;
                Ok(Fetched {
                    source,
                    cached: false,
                    stale: false,
                    warning: None,
                })
            }
            Err(error) => match cached {
                Some(source) => Ok(Fetched {
                    source,
                    cached: true,
                    stale: true,
                    warning: Some(format!(
                        "Live refresh failed; use dated cached evidence only. {error}"
                    )),
                }),
                None => Err(error),
            },
        }
    }
    fn load_memory(&self) -> Result<Memory, String> {
        let mut memory: Memory =
            read_json(&self.root.join("memory.json"), MAX_MEMORY)?.unwrap_or_default();
        let seeds: Memory =
            serde_json::from_str(include_str!("../../../data/proberserk-seed-memory.json"))
                .map_err(|e| format!("Invalid bundled research memory: {e}"))?;
        for (key, insight) in seeds.insights {
            memory.insights.entry(key).or_insert(insight);
        }
        if memory.version != 1 {
            return Err("Unsupported research memory version; original preserved".into());
        }
        Ok(memory)
    }
    fn save_insight(&self, insight: Insight) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        let lock = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.root.join("memory.lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock()
            .map_err(|_| "Another session is saving research memory; retry shortly")?;
        let mut memory = self.load_memory()?;
        if memory.insights.len() >= 500 && !memory.insights.contains_key(&insight.key) {
            return Err("Research memory has 500 topics; update an existing topic".into());
        }
        memory.insights.insert(insight.key.clone(), insight);
        atomic_json(&self.root.join("memory.json"), &memory)
    }
    fn recall(&self, args: &Recall, allowed_sets: &[u16]) -> Result<Value, String> {
        if args.query.len() > 500 || !(1..=30).contains(&args.limit) {
            return Err("Memory query limit is 500 bytes; result limit 1–30".into());
        }
        let memory = self.load_memory()?;
        let words: Vec<_> = berserk_leptos::model::normalize(&args.query)
            .split_whitespace()
            .map(str::to_owned)
            .collect();
        let mut found: Vec<_> = memory
            .insights
            .values()
            .filter(|i| args.format.is_none_or(|f| i.format == f))
            .filter_map(|insight| {
                let searchable = berserk_leptos::model::normalize(&format!(
                    "{} {} {} {}",
                    insight.title,
                    insight.lesson,
                    insight.applicability,
                    insight
                        .facts
                        .as_ref()
                        .map(Value::to_string)
                        .unwrap_or_default()
                ));
                let score = words
                    .iter()
                    .filter(|w| searchable.contains(w.as_str()))
                    .count();
                (words.is_empty() || score > 0).then_some((score, insight))
            })
            .collect();
        found
            .sort_by_key(|(score, i)| (std::cmp::Reverse(*score), std::cmp::Reverse(i.updated_at)));
        let total = found.len();
        let insights: Vec<_> = found
            .into_iter()
            .take(args.limit)
            .map(|(_, i)| {
                let mut value = serde_json::to_value(i).unwrap();
                if !args.include_facts && let Some(facts) = &i.facts {
                    value["facts"] = json!({"summary_only":true,"sample_decks":facts["sample_decks"],
                        "sample_events":facts["sample_events"],"sample_player_entries":facts["sample_player_entries"],
                        "note":"Use include_facts=true for the full comparison tables."});
                }
                value["age_days"] = json!((Utc::now().timestamp() - i.updated_at).max(0) / 86_400);
                value["scope_matches_current_sets"] = json!(
                    i.allowed_sets.is_empty()
                        || i.allowed_sets.iter().all(|s| allowed_sets.contains(s))
                );
                value
            })
            .collect();
        Ok(
            json!({"insights":insights,"total_matches":total,"persistent":true,"guidance":site::LIMITATIONS,
            "note":"Recall strategic lessons, then refresh sources. Old dates or a different set scope are historical evidence, not current format legality."}),
        )
    }
}

impl Workbench {
    fn research_sets(&self) -> Vec<u16> {
        self.cat.set_ids()
    }
    async fn audit(&self, change: impl FnOnce(&mut Audit)) -> Result<(), String> {
        let mut store = self.editing.lock().await;
        if let Some(mut workspace) = store.current.clone() {
            change(&mut workspace.research);
            store.replace(workspace)?;
        }
        Ok(())
    }
    pub async fn recall_research(&self, args: Recall) -> Result<Value, String> {
        let result = self.bridge.research.recall(&args, &self.research_sets())?;
        self.audit(|a| a.memory_reviewed = true).await?;
        Ok(result)
    }
    pub async fn research_events(&self, args: SearchEvents) -> Result<Value, String> {
        if !(1..=100).contains(&args.page) || args.min_players > 10_000 {
            return Err("page must be 1–100 and min_players at most 10000".into());
        }
        let today = Utc::now().date_naive();
        let from = args
            .from
            .as_deref()
            .map(site::valid_date)
            .transpose()?
            .unwrap_or(today - Days::days(365));
        let to = args
            .to
            .as_deref()
            .map(site::valid_date)
            .transpose()?
            .unwrap_or(today);
        if from > to || to > today {
            return Err("Use a non-future date interval with from <= to".into());
        }
        let mut url = Url::parse(&format!("{}/tournament/list/all", site::ORIGIN)).unwrap();
        url.query_pairs_mut().extend_pairs([
            ("format", args.format.key()),
            ("records", "100"),
            ("page", &args.page.to_string()),
            ("from", &from.to_string()),
            ("to", &to.to_string()),
        ]);
        let fetched = self
            .bridge
            .research
            .fetch(url.as_str(), |body| {
                let (events, more) = site::parse_list(body)?;
                Ok(json!({"events":events,"has_next_page":more}))
            })
            .await;
        match fetched {
            Ok(fetched) => {
                let mut events: Vec<site::Event> =
                    serde_json::from_value(fetched.source.data["events"].clone())
                        .map_err(|e| e.to_string())?;
                events.retain(|e| {
                    e.players >= args.min_players
                        && e.format == args.format
                        && e.date >= from.to_string()
                        && e.date <= to.to_string()
                });
                events.sort_by_key(|e| {
                    (
                        std::cmp::Reverse(e.date.clone()),
                        std::cmp::Reverse(e.players),
                    )
                });
                let has_next = fetched.source.data["has_next_page"] == true;
                self.audit(|a| {
                    a.discovery_attempted = true;
                    a.qualifying_events_found |= !events.is_empty();
                    a.unavailable_reason = if !a.qualifying_events_found && !has_next {
                        Some("No qualifying events in the requested date/format/attendance range; do not claim current tournament evidence.".into())
                    } else { None };
                }).await?;
                let mut view = fetched.view();
                view["data"] = json!({"events":events,"min_players":args.min_players,"from":from.to_string(),"to":to.to_string(),"next_page":has_next.then_some(args.page+1),"order":"date descending, then attendance; filtered within this site page"});
                Ok(view)
            }
            Err(error) => {
                self.audit(|a| {
                    a.discovery_attempted = true;
                    a.unavailable_reason = unavailable(&error).then(|| error.clone());
                })
                .await?;
                Err(format!(
                    "{error}. Research attempt recorded; consult saved memory and describe uncertainty instead of inventing results."
                ))
            }
        }
    }
    pub async fn research_tournament(&self, args: Resource) -> Result<Value, String> {
        let url = site::resource_url(&args.url, "tournament")?;
        let fetched = self
            .bridge
            .research
            .fetch(&url, |body| {
                serde_json::to_value(site::parse_tournament(body, &url)?).map_err(|e| e.to_string())
            })
            .await;
        match fetched {
            Ok(fetched) => Ok(fetched.view()),
            Err(error) => {
                self.audit(|a| a.unavailable_reason = unavailable(&error).then(|| error.clone()))
                    .await?;
                Err(error)
            }
        }
    }
    async fn fetched_deck(&self, url: &str) -> Result<(Fetched, site::Deck), String> {
        let fetched = self
            .bridge
            .research
            .fetch(url, |body| {
                serde_json::to_value(site::parse_deck(body, url)?).map_err(|e| e.to_string())
            })
            .await?;
        let deck =
            serde_json::from_value(fetched.source.data.clone()).map_err(|e| e.to_string())?;
        Ok((fetched, deck))
    }
    pub async fn research_deck(&self, args: Resource) -> Result<Value, String> {
        let url = site::resource_url(&args.url, "deck")?;
        let (fetched, deck) = match self.fetched_deck(&url).await {
            Ok(value) => value,
            Err(error) => {
                self.audit(|a| a.unavailable_reason = unavailable(&error).then(|| error.clone()))
                    .await?;
                return Err(error);
            }
        };
        let mut view = fetched.view();
        view["data"] = site::deck_view(&deck, &self.cat);
        Ok(view)
    }
    pub async fn remember_research(&self, args: Remember) -> Result<Value, String> {
        if args.key.is_empty()
            || args.key.len() > 100
            || !args
                .key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
            || args.title.trim().is_empty()
            || args.title.len() > 240
            || args.lesson.trim().is_empty()
            || args.lesson.len() > 4_000
            || args.applicability.trim().is_empty()
            || args.applicability.len() > 1_000
            || !(1..=8).contains(&args.sources.len())
        {
            return Err("Provide a stable ASCII topic key, title <=240 bytes, lesson <=4000, applicability <=1000, and 1–8 fetched source URLs".into());
        }
        let mut source_urls = args.sources.clone();
        let analyzed = self
            .editing
            .lock()
            .await
            .current
            .as_ref()
            .map(|w| w.research.analyzed_decks.clone())
            .unwrap_or_default();
        let compared: BTreeSet<_> = if analyzed.len() >= 2 {
            analyzed.into_iter().collect()
        } else {
            args.sources
                .iter()
                .filter_map(|s| site::resource_url(s, "deck").ok())
                .collect()
        };
        let facts = if compared.len() >= 2 {
            Some(self.compare_research(&compared)?)
        } else {
            None
        };
        for url in &compared {
            if !source_urls.contains(url) {
                source_urls.push(url.clone());
            }
        }
        let sources = self.evidence(&source_urls)?;
        for source in &sources {
            let data = self
                .bridge
                .research
                .cached(&source.url)?
                .ok_or("Source disappeared")?
                .data;
            let format = data
                .get("format")
                .or_else(|| data.get("event").and_then(|e| e.get("format")));
            if format.is_some_and(|f| *f != json!(args.format)) {
                return Err(
                    "Memory format must match its cited evidence; keep different formats separate"
                        .into(),
                );
            }
        }
        let key = args.key;
        self.bridge.research.save_insight(Insight {
            key: key.clone(),
            title: args.title,
            lesson: args.lesson,
            applicability: args.applicability,
            format: args.format,
            allowed_sets: self.research_sets(),
            sources,
            updated_at: Utc::now().timestamp(),
            kind: "agent_inference".into(),
            facts,
        })?;
        self.audit(|a| {
            if !a.saved_insights.contains(&key) {
                a.saved_insights.push(key.clone());
            }
        })
        .await?;
        Ok(
            json!({"saved":true,"key":key,"persistent":true,"note":"Available to other deck sessions through search_deck_memory; source dates and scope are retained."}),
        )
    }
    fn evidence(&self, urls: &[String]) -> Result<Vec<Evidence>, String> {
        urls.iter().map(|url| {
            let url = site::resource_url(url, "deck").or_else(|_| site::resource_url(url, "tournament"))?;
            let source = self.bridge.research.cached(&url)?.ok_or("Read source with get_proberserk_tournament/get_proberserk_deck before citing it in memory")?;
            let date = source.data["date"].as_str().or_else(|| source.data["event"]["date"].as_str()).map(str::to_owned);
            Ok(Evidence { url, fetched_at: source.fetched_at, event_date: date })
        }).collect()
    }
    pub async fn analyze_research(&self, args: Analyze) -> Result<Value, String> {
        let urls: BTreeSet<_> = args
            .deck_urls
            .iter()
            .map(|s| site::resource_url(s, "deck"))
            .collect::<Result<_, _>>()?;
        if !(2..=8).contains(&urls.len()) || urls.len() != args.deck_urls.len() {
            return Err("Compare 2–8 distinct deck URLs".into());
        }
        let facts = self.compare_research(&urls)?;
        self.audit(|a| {
            a.analyzed_decks = urls.into_iter().collect();
            // Require a memory save AFTER this comparison so its facts survive the run.
            a.saved_insights.clear();
            a.unavailable_reason = None;
        })
        .await?;
        Ok(
            json!({"analysis":facts,"next":"Read card rules and adapt roles under the allowed sets and owned pool. Call remember_deck_insight with useful conclusions; it saves both the lesson and these measured facts. This comparison reads only previously fetched evidence."}),
        )
    }
    fn compare_research(&self, urls: &BTreeSet<String>) -> Result<Value, String> {
        let mut decks = Vec::new();
        let mut source_views = Vec::new();
        let mut events = BTreeMap::<String, site::Tournament>::new();
        for url in urls {
            let source = self
                .bridge
                .research
                .cached(url)?
                .ok_or("Read every deck with get_proberserk_deck before comparison")?;
            let deck: site::Deck =
                serde_json::from_value(source.data.clone()).map_err(|e| e.to_string())?;
            let stale = Utc::now().timestamp() - source.fetched_at >= CACHE_SECONDS;
            if !events.contains_key(&deck.tournament_url) {
                let source = self.bridge.research.cached(&deck.tournament_url)?.ok_or("Inspect the tournament standings with get_proberserk_tournament before analyzing its decks")?;
                events.insert(
                    deck.tournament_url.clone(),
                    serde_json::from_value(source.data).map_err(|e| e.to_string())?,
                );
            }
            let event = &events[&deck.tournament_url];
            if site::valid_date(&event.event.date)? > Utc::now().date_naive() {
                return Err(
                    "Future-dated events are not evidence of completed tournament results".into(),
                );
            }
            let standing = event
                .decks
                .iter()
                .find(|d| d.url == deck.url)
                .ok_or("Deck is not present in its tournament standings")?;
            if !standing.rank.is_some_and(|r| (1..=8).contains(&r)) || event.event.players < 16 {
                return Err("Winner analysis needs exact top-8 placements at events with at least 16 reported participants; Top-N labels alone do not establish exact placement".into());
            }
            if deck.format != event.event.format
                || deck.date != event.event.date
                || deck.player != standing.player
            {
                return Err("Deck and tournament metadata disagree; inspect the source before drawing conclusions".into());
            }
            source_views
                .push(json!({"source_url":url,"fetched_at":source.fetched_at,"stale":stale}));
            decks.push((deck, standing.clone()));
        }
        let format = decks[0].0.format;
        if decks.iter().any(|(d, _)| d.format != format) {
            return Err(
                "Compare one format at a time; do not mix standard, eternal and limited".into(),
            );
        }
        let mut frequencies = BTreeMap::<String, (String, usize, u32, BTreeSet<String>)>::new();
        let summaries: Vec<_> = decks.iter().map(|(deck, standing)| {
            let mut per_deck = BTreeMap::<String, (String, u32)>::new();
            for card in deck.cards.iter().filter(|c| c.zone == "main") { let v = per_deck.entry(berserk_leptos::model::normalize(&card.name)).or_insert((card.name.clone(), 0)); v.1 += card.count; }
            for (key, (name, copies)) in per_deck {
                let stat = frequencies.entry(key).or_insert((name,0,0,BTreeSet::new()));
                stat.1 += 1; stat.2 += copies; stat.3.insert(deck.tournament_url.clone());
            }
            let elite: u32 = deck.cards.iter().filter(|c| c.zone == "main" && c.section == "elite").map(|c| c.count).sum();
            let total: u32 = deck.cards.iter().filter(|c| c.zone == "main").map(|c| c.count).sum();
            let sideboard: u32 = deck.cards.iter().filter(|c| c.zone == "sideboard").map(|c| c.count).sum();
            let mut curve = BTreeMap::<u32,u32>::new();
            for c in deck.cards.iter().filter(|c| c.zone == "main") { if let Some(cost) = c.cost { *curve.entry(cost).or_default() += c.count; } }
            json!({"url":deck.url,"name":deck.name,"player":deck.player,"placement":standing.placement,"record":standing.record,
                "tournament":events[&deck.tournament_url].event,"sets":deck.sets,"total_cards":total,"sideboard_cards":sideboard,"elite":elite,"regular":total-elite,"cost_curve":curve})
        }).collect();
        let mut counts: Vec<_> = frequencies.into_values().collect();
        counts.sort_by_key(|(_, n, copies, _)| (std::cmp::Reverse(*n), std::cmp::Reverse(*copies)));
        let cards: Vec<_> = counts.into_iter().map(|(name,n,copies,events)| json!({"name":name,"sample_decks":n,"total_copies":copies,"sample_events":events.len()})).collect();
        let players: BTreeSet<_> = decks
            .iter()
            .map(|(d, _)| (&d.tournament_url, &d.player))
            .collect();
        let facts = json!({"sample_decks":decks.len(),"sample_events":events.len(),"sample_player_entries":players.len(),
            "decks":summaries,"card_frequencies":cards,"sources":source_views,"limitations":site::LIMITATIONS});
        Ok(facts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn insight(key: &str, lesson: &str) -> Insight {
        Insight {
            key: key.into(),
            title: "Стратегия лесов".into(),
            lesson: lesson.into(),
            applicability: "Historical standard sample".into(),
            format: site::Format::Standard,
            allowed_sets: vec![80],
            sources: vec![Evidence {
                url: "https://proberserk.ru/deck/abc".into(),
                fetched_at: 100,
                event_date: Some("2026-10-25".into()),
            }],
            updated_at: Utc::now().timestamp(),
            kind: "agent_inference".into(),
            facts: None,
        }
    }
    #[test]
    fn memory_survives_new_process_instances_and_updates_without_duplicates() {
        let root = tempfile::tempdir().unwrap();
        let first = Research::new(root.path().into()).unwrap();
        first
            .save_insight(insight("forest", "Одна гипотеза"))
            .unwrap();
        let second = Research::new(root.path().into()).unwrap();
        let query = Recall {
            query: "лесов".into(),
            format: Some(site::Format::Standard),
            limit: 10,
            include_facts: false,
        };
        assert_eq!(
            second.recall(&query, &[80]).unwrap()["insights"][0]["lesson"],
            "Одна гипотеза"
        );
        second
            .save_insight(insight("forest", "Уточнённый вывод"))
            .unwrap();
        let result = first.recall(&query, &[70]).unwrap();
        assert_eq!(result["total_matches"], 1);
        assert_eq!(result["insights"][0]["lesson"], "Уточнённый вывод");
        assert_eq!(result["insights"][0]["scope_matches_current_sets"], false);
        assert_eq!(
            result["insights"][0]["sources"][0]["event_date"],
            "2026-10-25"
        );
    }
    #[test]
    fn memory_searches_cards_in_evidence_without_dumping_tables_by_default() {
        let root = tempfile::tempdir().unwrap();
        let store = Research::new(root.path().into()).unwrap();
        let mut note = insight("sample", "Наблюдение о выборке");
        note.facts = Some(
            json!({"sample_decks":2,"sample_events":2,"card_frequencies":[{"name":"КартаУникальныйТест","sample_decks":2}]}),
        );
        store.save_insight(note).unwrap();
        let mut query = Recall {
            query: "картауникальныйтест".into(),
            format: None,
            limit: 10,
            include_facts: false,
        };
        let result = store.recall(&query, &[80]).unwrap();
        assert_eq!(result["total_matches"], 1);
        assert_eq!(result["insights"][0]["facts"]["summary_only"], true);
        assert!(result["insights"][0]["facts"]["card_frequencies"].is_null());
        query.include_facts = true;
        assert_eq!(
            store.recall(&query, &[80]).unwrap()["insights"][0]["facts"]["card_frequencies"][0]["sample_decks"],
            2
        );
    }
    #[test]
    fn corrupt_memory_is_preserved_and_lock_prevents_lost_updates() {
        let root = tempfile::tempdir().unwrap();
        let store = Research::new(root.path().into()).unwrap();
        let path = root.path().join("memory.json");
        fs::write(&path, "broken").unwrap();
        assert!(store.save_insight(insight("a", "b")).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "broken");
        fs::write(&path, r#"{"version":1,"insights":{}}"#).unwrap();
        let lock = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.path().join("memory.lock"))
            .unwrap();
        lock.try_lock().unwrap();
        assert!(
            store
                .save_insight(insight("a", "b"))
                .unwrap_err()
                .contains("Another session")
        );
    }
    #[test]
    fn automatic_decks_cannot_skip_research_but_can_record_real_unavailability() {
        let mut audit = Audit::required();
        assert!(audit.validate().is_err());
        audit.memory_reviewed = true;
        assert!(audit.validate().is_err());
        audit.discovery_attempted = true;
        assert!(audit.validate().is_err());
        audit.analyzed_decks = vec!["a".into(), "b".into()];
        assert!(audit.validate().is_err());
        audit.saved_insights.push("lesson".into());
        assert!(audit.validate().is_ok());
        audit.analyzed_decks.clear();
        audit.saved_insights.clear();
        audit.unavailable_reason = Some("HTTP 503".into());
        assert!(audit.validate().is_ok());
        assert!(Audit::default().validate().is_ok());
    }
    #[tokio::test]
    async fn cached_evidence_is_reused_without_network_and_marks_fallback_stale() {
        let root = tempfile::tempdir().unwrap();
        let mut store = Research::new(root.path().into()).unwrap();
        let url = "https://proberserk.ru/deck/abc";
        let mut source = Source {
            version: 1,
            url: url.into(),
            fetched_at: Utc::now().timestamp(),
            data: json!({"name":"cached"}),
        };
        atomic_json(&store.cache_path(url), &source).unwrap();
        let fetched = store
            .fetch(url, |_| panic!("must use fresh cache"))
            .await
            .unwrap();
        assert!(fetched.cached && !fetched.stale);
        // Closed local test proxy makes the outage deterministic, without contacting the site.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        store.client = Client::builder()
            .proxy(reqwest::Proxy::all(format!("http://{address}")).unwrap())
            .timeout(Duration::from_secs(1))
            .build()
            .unwrap();
        source.fetched_at -= CACHE_SECONDS + 1;
        atomic_json(&store.cache_path(url), &source).unwrap();
        let fetched = store.fetch(url, |_| panic!("offline")).await.unwrap();
        assert!(fetched.cached && fetched.stale);
        assert!(fetched.warning.unwrap().contains("Live refresh failed"));
        assert_eq!(fetched.source.fetched_at, source.fetched_at);
    }
}

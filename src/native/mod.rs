//! Native desktop client. The domain and wire contracts are shared with the web app.
mod bridge;
mod card_shape;
mod codex_auth;
mod deck_import;
mod deck_overview;
mod deck_widgets;
mod effects;
mod images;
mod motion;
mod notes;
mod skin;
pub mod storage;
mod transfer;
mod views;

use crate::{
    agent::{self, BrowserCommand, BrowserReply, BuildEvent, BuildProgress},
    model::*,
};
use bridge::{Bridge, Event, Outgoing};
use eframe::egui;
use std::{
    collections::{BTreeSet, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex, mpsc},
    time::{Duration, Instant},
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    Catalog,
    Collection,
    Decks,
    CreateWithCodex,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum TransferKind {
    Backup,
    Collection,
    Deck,
}
struct Transfer {
    id: String,
    decks: Vec<deck_import::DeckFile>,
    kind: TransferKind,
    text: String,
    merge: bool,
    confirm: bool,
    error: String,
    source: Option<String>,
    statistics: Option<Result<transfer::CollectionStatistics, String>>,
}
struct Pending {
    next: UserData,
    receiver: mpsc::Receiver<Result<(), String>>,
    reply: Option<BrowserReply>,
    active: Option<String>,
    undo: bool,
}
#[derive(Default)]
struct Hand {
    cards: Vec<String>,
    selected: BTreeSet<usize>,
    second: bool,
    mulligans: u32,
    open: bool,
}
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(default)]
struct Settings {
    reduced: bool,
    effects: bool,
    list: bool,
    allowed_sets: Vec<u16>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            reduced: false,
            effects: true,
            list: false,
            allowed_sets: Vec::new(),
        }
    }
}

pub struct NativeApp {
    cat: Arc<Catalog>,
    user: UserData,
    store: storage::Store,
    storage_error: Option<String>,
    pending: Option<Pending>,
    undo: VecDeque<UserData>,
    page: Page,
    active: Option<String>,
    side: bool,
    deck_full: bool,
    detail: Option<String>,
    draft: Option<Deck>,
    delete: Option<String>,
    filter: Filter,
    filters_open: bool,
    filtered: Vec<usize>,
    dirty: bool,
    page_number: usize,
    classes: Vec<String>,
    images: images::Images,
    effects: Arc<Mutex<effects::Effects>>,
    skin: Arc<Mutex<skin::Skin>>,
    animated: bool,
    settings: Settings,
    motion: motion::Motion,
    transfer: Option<Transfer>,
    file_result: Option<mpsc::Receiver<Result<Option<transfer::FileResult>, String>>>,
    status: String,
    hand: Hand,
    notes_edit: bool,
    notes_draft: Option<Deck>,
    bridge: Option<Bridge>,
    connected: bool,
    connection_error: Option<String>,
    progress: BuildProgress,
    preferences: String,
    feedback: String,
    ai_size: u16,
    restart: bool,
    pair_url: String,
    directory: PathBuf,
    login: Option<std::process::Child>,
    codex_auth: codex_auth::Auth,
    external_service: bool,
    smoke: Option<(Instant, Option<PathBuf>)>,
    frames: u64,
    smoke_pointer: Option<egui::Pos2>,
    close_after_save: bool,
    startup_empty: bool,
    search_ms: f64,
    frame_ms: f64,
    visible_cards: usize,
    rename: Option<(String, String)>,
    burst: Option<(Instant, egui::Pos2, u8)>,
}
impl NativeApp {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        root: PathBuf,
        assets: PathBuf,
        directory: PathBuf,
        smoke: Option<Option<PathBuf>>,
    ) -> Result<Self, String> {
        let cat = Arc::new(Catalog::load().map_err(|e| e.to_string())?);
        let store = storage::Store::open(&root, cc.egui_ctx.clone())?;
        let startup_empty = !store.path.exists();
        let (user, storage_error) = match storage::load(&store.path, &cat) {
            Ok(user) => (user, None),
            Err(e) => (UserData::default(), Some(e)),
        };
        let classes = cat
            .cards
            .iter()
            .flat_map(|c| c.classes.iter().filter(|s| !s.is_empty()).cloned())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let mut settings: Settings = std::fs::read(root.join("preferences.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        if validate_allowed_sets(Some(&settings.allowed_sets), &cat).is_err() {
            settings.allowed_sets = cat.set_ids();
        }
        skin::configure(&cc.egui_ctx);
        let mut skin = skin::Skin::default();
        if let Some(gl) = &cc.gl {
            skin.prepare(gl);
        }
        let mut effects = effects::Effects::default();
        if let Some(gl) = &cc.gl {
            effects.prepare(gl);
        }
        if smoke.is_some()
            && let Some(gl) = &cc.gl
        {
            effects.validate_all(gl);
        }
        if let Some(error) = &skin.error {
            effects.failures.push(format!("Material shader: {error}"));
        }
        let bridge = smoke
            .is_some()
            .then(|| Bridge::start(&directory, cc.egui_ctx.clone(), None));
        Ok(Self {
            cat,
            user,
            store,
            storage_error,
            pending: None,
            undo: VecDeque::new(),
            page: Page::Catalog,
            active: None,
            side: false,
            deck_full: false,
            detail: None,
            draft: None,
            delete: None,
            filter: Filter::default(),
            filters_open: true,
            filtered: Vec::new(),
            dirty: true,
            page_number: 0,
            classes,
            images: images::Images::new(assets, cc.egui_ctx.clone()),
            effects: Arc::new(Mutex::new(effects)),
            skin: Arc::new(Mutex::new(skin)),
            animated: false,
            settings,
            motion: motion::Motion::new(&cc.egui_ctx),
            transfer: None,
            file_result: None,
            status: String::new(),
            hand: Hand::default(),
            notes_edit: false,
            notes_draft: None,
            bridge,
            connected: false,
            connection_error: None,
            progress: BuildProgress::default(),
            preferences: String::new(),
            feedback: String::new(),
            ai_size: 30,
            restart: false,
            pair_url: String::new(),
            directory,
            login: None,
            codex_auth: codex_auth::Auth::default(),
            external_service: false,
            smoke: smoke.map(|r| (Instant::now(), r)),
            frames: 0,
            smoke_pointer: None,
            close_after_save: false,
            startup_empty,
            search_ms: 0.0,
            frame_ms: 0.0,
            visible_cards: 0,
            rename: None,
            burst: None,
        })
    }
    fn deck(&self) -> Option<&Deck> {
        self.user
            .decks
            .iter()
            .find(|d| Some(&d.id) == self.active.as_ref())
    }
    fn id() -> String {
        uuid::Uuid::new_v4().to_string()
    }
    fn change(&mut self, f: impl FnOnce(&mut UserData)) {
        if self.pending.is_some() || self.storage_error.is_some() {
            return;
        }
        let mut next = self.user.clone();
        f(&mut next);
        if next == self.user {
            return;
        }
        if let Err(e) = next.validate(&self.cat) {
            self.status = e;
            return;
        }
        self.submit(next, None, None, false);
    }
    fn submit(
        &mut self,
        next: UserData,
        reply: Option<BrowserReply>,
        active: Option<String>,
        undo: bool,
    ) {
        let receiver = self.store.save(next.clone());
        self.pending = Some(Pending {
            next,
            receiver,
            reply,
            active,
            undo,
        });
    }
    fn edit_deck(&mut self, f: impl FnOnce(&mut Deck)) {
        let active = self.active.clone();
        self.change(|u| {
            if let Some(d) = u.decks.iter_mut().find(|d| Some(&d.id) == active.as_ref()) {
                f(d);
            }
        });
    }
    fn own(&mut self, id: &str, delta: i32) {
        self.change(|u| u.set_count(id, u.count(id).saturating_add_signed(delta)));
    }
    fn favorite(&mut self, id: &str) {
        self.change(|u| {
            if !u.favorites.remove(id) {
                u.favorites.insert(id.into());
            }
        });
    }
    fn add_card(&mut self, id: &str) {
        if self.deck().is_some() {
            let side = self.side;
            self.edit_deck(|d| d.add(id, side));
        } else {
            let mut d = Deck::new(Self::id(), "Новая колода".into());
            d.allowed_sets = Some(self.settings.allowed_sets.clone());
            d.cards.push(id.into());
            self.draft = Some(d);
        }
    }
    fn undo(&mut self) {
        if self.pending.is_none()
            && self.storage_error.is_none()
            && let Some(previous) = self.undo.back().cloned()
        {
            self.submit(previous, None, None, true);
        }
    }
    fn reply(&self, reply: BrowserReply) {
        if let Some(bridge) = &self.bridge {
            let _ = bridge.outgoing.send(Outgoing::Reply(reply));
        }
    }
    fn poll(&mut self, ctx: &egui::Context) {
        self.motion.poll(ctx);
        if let Some(pending) = &self.pending {
            match pending.receiver.try_recv() {
                Ok(result) => {
                    let mut pending = self.pending.take().unwrap();
                    match result {
                        Ok(()) => {
                            if pending.undo {
                                self.undo.pop_back();
                            } else {
                                if self.undo.len() == 30 {
                                    self.undo.pop_front();
                                }
                                self.undo.push_back(std::mem::replace(
                                    &mut self.user,
                                    pending.next.clone(),
                                ));
                            }
                            self.user = pending.next;
                            self.dirty = true;
                            self.startup_empty = false;
                            if let Some(id) = pending.active {
                                self.active = Some(id);
                                self.page = Page::Decks;
                                self.side = false;
                            }
                            if self
                                .active
                                .as_ref()
                                .is_some_and(|id| !self.user.decks.iter().any(|d| &d.id == id))
                            {
                                self.active = None;
                            }
                            if self.close_after_save {
                                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                            }
                        }
                        Err(error) => {
                            self.close_after_save = false;
                            self.status =
                                format!("Сохранение не удалось; изменение не применено: {error}");
                            if let Some(reply) = &mut pending.reply {
                                reply.result = Err(self.status.clone());
                            }
                        }
                    }
                    if let Some(reply) = pending.reply {
                        self.reply(reply);
                    }
                }
                Err(mpsc::TryRecvError::Disconnected) => {
                    self.pending = None;
                    self.status = "Поток сохранения остановился; изменение не применено".into();
                    self.close_after_save = false;
                }
                Err(mpsc::TryRecvError::Empty) => {}
            }
        }
        let events: Vec<_> = self
            .bridge
            .as_ref()
            .map(|b| b.incoming.try_iter().collect())
            .unwrap_or_default();
        for event in events {
            match event {
                Event::Connected => {
                    self.connected = true;
                    self.connection_error = None;
                    self.status = "Сервис создания колод подключён".into();
                }
                Event::Error(e) => {
                    self.connected = false;
                    self.connection_error = Some(e.clone());
                    self.status = e;
                    if self.progress.busy() {
                        self.progress.phase = "failed".into();
                        self.progress.message =
                            "Соединение потеряно. Проверьте сохранённые колоды перед повтором."
                                .into();
                    }
                }
                Event::Request(request) => {
                    let request = *request;
                    if let BrowserCommand::BuildProgress { progress } = request.command {
                        if progress.phase == "failed" {
                            self.codex_auth.invalidate();
                        }
                        self.progress = progress;
                        self.reply(BrowserReply {
                            id: request.id,
                            result: Ok(serde_json::json!({"received":true})),
                        });
                        continue;
                    }
                    let saving = matches!(&request.command, BrowserCommand::SaveDeck { .. });
                    if saving && (self.pending.is_some() || self.storage_error.is_some()) {
                        self.reply(BrowserReply { id: request.id, result: Err("Storage is busy or unavailable. Read the deck again before retrying.".into()) });
                        continue;
                    }
                    let active = match &request.command {
                        BrowserCommand::SaveDeck { deck, .. } => Some(deck.id.clone()),
                        _ => None,
                    };
                    let mut next = self.user.clone();
                    let result = agent::apply_command(&mut next, &self.cat, request.command);
                    let reply = BrowserReply {
                        id: request.id,
                        result,
                    };
                    if saving && reply.result.is_ok() {
                        self.submit(next, Some(reply), active, false);
                    } else {
                        self.reply(reply);
                    }
                }
            }
        }
        self.codex_auth.poll();
        if let Some(child) = &mut self.login {
            match child.try_wait() {
                Ok(Some(status)) => {
                    self.login = None;
                    self.codex_auth.invalidate();
                    self.codex_auth.ensure(ctx);
                    self.status = if status.success() {
                        "Проверяем вход в Codex…"
                    } else {
                        "Вход не завершён. Повторите вход в Codex."
                    }
                    .into();
                }
                Ok(None) => ctx.request_repaint_after(Duration::from_millis(250)),
                Err(_) => {
                    if let Some(mut child) = self.login.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    self.codex_auth.invalidate();
                    self.status = "Не удалось завершить вход в Codex. Повторите попытку.".into();
                }
            }
        }
        self.poll_file();
        self.images.poll(ctx);
        if self.pending.is_some() || self.file_result.is_some() {
            ctx.request_repaint_after(Duration::from_millis(16));
        }
    }
    fn connect(&mut self, ctx: &egui::Context, pair_url: Option<String>) {
        self.connected = false;
        self.external_service = pair_url.is_some();
        self.connection_error = None;
        self.bridge = Some(Bridge::start(&self.directory, ctx.clone(), pair_url));
        self.status = "Подключение…".into();
    }
    fn ai_blocker(&self, refine: bool) -> Option<&'static str> {
        if self.storage_error.is_some() {
            Some("Сначала восстановите хранилище через «Мои данные».")
        } else if self.pending.is_some() {
            Some("Дождитесь сохранения изменений.")
        } else if self.progress.busy() {
            Some("Codex уже работает над колодой. Дождитесь результата или отмените генерацию.")
        } else if !refine && self.user.total() == 0 {
            Some(
                "В коллекции нет карт. Codex собирает колоду из ваших карт: укажите количество в энциклопедии или импортируйте коллекцию.",
            )
        } else if !refine && self.settings.allowed_sets.is_empty() {
            Some("Выберите хотя бы один разрешённый набор.")
        } else if !self.connected {
            Some("Для работы с Codex нужно подключение к сервису создания колод.")
        } else if !self.external_service && self.login.is_some() {
            Some("Завершите вход в Codex в браузере.")
        } else if !self.external_service && self.codex_auth.status == codex_auth::Status::SignedOut
        {
            Some("Войдите в Codex, чтобы создать или обсудить колоду.")
        } else if !self.external_service && self.codex_auth.status == codex_auth::Status::Missing {
            Some("Установите Codex CLI, затем нажмите «Проверить вход».")
        } else if refine && self.feedback.trim().is_empty() {
            Some("Напишите, что хотите изменить в колоде.")
        } else {
            None
        }
    }
    fn build(&mut self, event: BuildEvent) {
        let id = match &event {
            BuildEvent::BuildDeck { request_id, .. }
            | BuildEvent::RefineDeck { request_id, .. }
            | BuildEvent::CancelBuild { request_id } => request_id.clone(),
        };
        if let Some(bridge) = &self.bridge
            && self.connected
            && bridge.outgoing.send(Outgoing::Build(event)).is_ok()
        {
            self.progress = BuildProgress {
                request_id: id,
                phase: "queued".into(),
                message: "Отправлено в Codex…".into(),
                deck_id: None,
            };
        } else {
            self.status = "Сначала подключите Codex".into();
        }
    }
    fn refilter(&mut self) {
        if !self.dirty {
            return;
        }
        let start = Instant::now();
        let mut filter = self.filter.clone();
        if self.page == Page::Collection {
            filter.owned = "owned".into();
        }
        let positions: std::collections::HashMap<_, _> = self
            .cat
            .cards
            .iter()
            .enumerate()
            .map(|(i, c)| (c.id.as_str(), i))
            .collect();
        self.filtered = filter
            .apply(&self.cat, &self.user)
            .into_iter()
            .filter(|c| self.page != Page::Decks || self.deck().is_none_or(|d| d.allows(c)))
            .map(|c| positions[c.id.as_str()])
            .collect();
        self.page_number = self
            .page_number
            .min(self.filtered.len().saturating_sub(1) / 60);
        self.search_ms = start.elapsed().as_secs_f64() * 1000.0;
        self.dirty = false;
    }
}
impl eframe::App for NativeApp {
    fn raw_input_hook(&mut self, _: &egui::Context, input: &mut egui::RawInput) {
        if self.smoke.is_some()
            && let Some(pointer) = self.smoke_pointer
        {
            input.events.push(egui::Event::PointerMoved(pointer));
            input.focused = true;
            if let Some(viewport) = input.viewports.get_mut(&input.viewport_id) {
                viewport.focused = Some(true);
            }
        }
    }
    fn logic(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        self.poll(ctx);
    }
    fn ui(&mut self, root: &mut egui::Ui, _: &mut eframe::Frame) {
        let start = Instant::now();
        let ctx = root.ctx().clone();
        self.animated = false;
        self.visible_cards = 0;
        self.frames += 1;
        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            self.detail = None;
            self.transfer = None;
            self.draft = None;
            self.delete = None;
            self.hand.open = false;
        }
        if ctx.input_mut(|i| i.consume_key(egui::Modifiers::COMMAND, egui::Key::Z)) {
            self.undo();
        }
        if ctx.input(|i| i.viewport().close_requested()) && self.pending.is_some() {
            self.close_after_save = true;
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
        }
        skin::Skin::paint(&self.skin, root, root.max_rect(), skin::Material::Wood, 0.0);
        self.top(root);
        let foreground = ctx.input(|i| {
            i.viewport().focused.unwrap_or(true) && !i.viewport().minimized.unwrap_or(false)
        });
        let map_animated = self.skin.lock().unwrap().update_map_motion(
            ctx.input(|i| i.time),
            foreground && !self.settings.reduced && !self.motion.reduced,
        );
        root.add_enabled_ui(self.pending.is_none(), |root| {
            if self.filters_open
                && self.page != Page::CreateWithCodex
                && (self.page != Page::Decks || self.active.is_some())
                && !(self.page == Page::Decks && self.deck_full)
            {
                egui::Panel::left("filters")
                    .default_size(222.0)
                    .min_size(200.0)
                    .frame(egui::Frame::new().inner_margin(16))
                    .resizable(true)
                    .show(root, |ui| {
                        skin::Skin::paint(
                            &self.skin,
                            ui,
                            ui.max_rect().expand(10.0),
                            skin::Material::Leather,
                            0.0,
                        );
                        self.filters(ui);
                    });
            }
            if self.page == Page::Decks && self.active.is_some() {
                egui::Panel::right("deck")
                    .default_size(340.0)
                    .min_size(280.0)
                    .frame(egui::Frame::new().inner_margin(16))
                    .resizable(true)
                    .show(root, |ui| {
                        skin::Skin::paint(
                            &self.skin,
                            ui,
                            ui.max_rect().expand(10.0),
                            skin::Material::Leather,
                            0.0,
                        );
                        self.deck_panel(ui);
                    });
            }
            egui::CentralPanel::default()
                .frame(egui::Frame::new().inner_margin(22))
                .show(root, |ui| {
                    skin::Skin::paint(
                        &self.skin,
                        ui,
                        ui.max_rect().expand(14.0),
                        skin::Material::Paper,
                        0.0,
                    );
                    skin::ornament(ui, ui.max_rect().expand(14.0));
                    skin::paper_style(ui);
                    if self.page == Page::CreateWithCodex {
                        self.codex_creation(ui);
                    } else if self.page == Page::Decks && self.active.is_none() {
                        self.deck_library(ui);
                    } else if self.page == Page::Decks && self.deck_full {
                        self.deck_overview(ui);
                    } else {
                        self.catalog(ui);
                    }
                });
        });
        self.detail_window(&ctx);
        self.draft_window(&ctx);
        self.delete_window(&ctx);
        self.transfer_window(&ctx);
        self.hand_window(&ctx);
        if let Some((started, center, rarity)) = self.burst {
            let t = started.elapsed().as_secs_f32() / 0.65;
            if t >= 1.0 || self.settings.reduced || self.motion.reduced {
                self.burst = None;
            } else {
                let painter = ctx.layer_painter(egui::LayerId::new(
                    egui::Order::Tooltip,
                    egui::Id::new("collection-burst"),
                ));
                let color =
                    egui::Color32::from_rgba_unmultiplied(240, 190, 80, ((1.0 - t) * 255.0) as u8);
                painter.text(
                    center - egui::vec2(0.0, 15.0 + t * 35.0),
                    egui::Align2::CENTER_CENTER,
                    "+1",
                    egui::FontId::proportional(19.0),
                    color,
                );
                if rarity >= 3 {
                    for i in 0..if rarity == 4 { 12 } else { 6 } {
                        let angle = i as f32 * 0.55;
                        let offset = egui::vec2(angle.cos(), angle.sin()) * t * 65.0;
                        painter.circle_filled(
                            center + offset - egui::vec2(0.0, t * 25.0),
                            2.5 * (1.0 - t),
                            color,
                        );
                    }
                }
                ctx.request_repaint_after(Duration::from_millis(16));
            }
        }
        if foreground && (self.animated || map_animated) {
            // Map-only drift needs just 15 fps; card effects retain their 30 fps cap.
            ctx.request_repaint_after(Duration::from_millis(if self.animated { 33 } else { 67 }));
        }
        if let Some((began, report)) = &self.smoke {
            if self.frames >= 5
                && (self.smoke_pointer.is_none() || began.elapsed() > Duration::from_secs(2))
                && (self.images.bytes() > 0
                    || (matches!(self.page, Page::Decks | Page::CreateWithCodex)
                        && self.user.decks.is_empty()))
                && self.images.settled()
                && self.pending.is_none()
                && (self.page != Page::CreateWithCodex || !self.codex_auth.checking())
                && self.connected
            {
                let errors = self.effects.lock().unwrap().failures.clone();
                let result = if errors.is_empty() && self.images.errors == 0 {
                    "PASS: Native GPU window, all shaders, Cyrillic catalog, visible artwork and private AI pairing loaded".to_string()
                } else {
                    format!(
                        "FAIL: shader/image errors: {errors:?} / {}",
                        self.images.errors
                    )
                };
                let screenshot = ctx.input(|i| {
                    i.events.iter().find_map(|event| match event {
                        egui::Event::Screenshot { image, .. } => Some(image.clone()),
                        _ => None,
                    })
                });
                if let Some(path) = report {
                    if let Some(image) = screenshot {
                        let bytes: Vec<u8> =
                            image.pixels.iter().flat_map(|p| p.to_array()).collect();
                        let capture = image::save_buffer(
                            path.with_extension("png"),
                            &bytes,
                            image.size[0] as u32,
                            image.size[1] as u32,
                            image::ColorType::Rgba8,
                        );
                        let result = capture
                            .map(|_| result)
                            .unwrap_or_else(|e| format!("FAIL: screenshot: {e}"));
                        let _ = std::fs::write(path, &result);
                        eprintln!("{result}");
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                        self.smoke = None;
                    } else {
                        ctx.send_viewport_cmd(
                            egui::ViewportCommand::Screenshot(Default::default()),
                        );
                    }
                } else {
                    eprintln!("{result}");
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    self.smoke = None;
                }
            } else if began.elapsed() > Duration::from_secs(90) {
                let result = format!(
                    "FAIL: Native readiness timed out: frames={}, visible_cards={}, artwork_bytes={}, images_settled={}, image_errors={}, connected={}, service_error={:?}, shader_errors={:?}",
                    self.frames,
                    self.visible_cards,
                    self.images.bytes(),
                    self.images.settled(),
                    self.images.errors,
                    self.connected,
                    self.connection_error,
                    self.effects.lock().unwrap().failures,
                );
                if let Some(path) = report {
                    let _ = std::fs::write(path, &result);
                }
                eprintln!("{result}");
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            } else {
                ctx.request_repaint_after(Duration::from_millis(50));
            }
        }
        self.frame_ms = start.elapsed().as_secs_f64() * 1000.0;
    }
    fn on_exit(&mut self, gl: Option<&eframe::glow::Context>) {
        if let Some(gl) = gl {
            self.effects.lock().unwrap().destroy(gl);
            self.skin.lock().unwrap().destroy(gl);
        }
        if let Some(mut login) = self.login.take() {
            let _ = login.kill();
            let _ = login.wait();
        }
        if let Ok(bytes) = serde_json::to_vec(&self.settings) {
            let _ =
                storage::atomic_write(&self.store.path.with_file_name("preferences.json"), &bytes);
        }
    }
}

pub fn run(smoke: bool, report: Option<PathBuf>) -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::env::current_exe()?
        .parent()
        .ok_or("Missing executable directory")?
        .to_owned();
    let resources = if cfg!(target_os = "macos") && directory.ends_with("MacOS") {
        directory.parent().unwrap().join("Resources")
    } else {
        directory.clone()
    };
    let assets = std::env::var_os("BERSERK_ASSET_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if resources.join("public/cards").is_dir() {
                resources.clone()
            } else {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            }
        });
    if !assets.join("public/cards").is_dir() {
        return Err(
            "Bundled card artwork is missing; extract the complete application archive".into(),
        );
    }
    let temporary = if smoke {
        Some(tempfile::tempdir()?)
    } else {
        None
    };
    let root = temporary
        .as_ref()
        .map(|t| Ok(t.path().to_owned()))
        .unwrap_or_else(storage::data_dir)?;
    let smoke_view = if smoke {
        std::env::var("BERSERK_SMOKE_VIEW").unwrap_or_default()
    } else {
        String::new()
    };
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size(if smoke_view.starts_with("compact") {
                [850.0, 600.0]
            } else {
                [1280.0, 860.0]
            })
            .with_min_inner_size([850.0, 600.0])
            .with_app_id("ru.berserk.collection"),
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    let report = if smoke {
        Some(report.unwrap_or_else(|| root.join("smoke-result.txt")))
    } else {
        report
    };
    let checked_report = report.clone();
    eframe::run_native(
        "Berserk",
        options,
        Box::new(move |cc| {
            let mut app = NativeApp::new(cc, root, assets, directory, smoke.then_some(report))
                .map_err(std::io::Error::other)?;
            if smoke {
                match smoke_view.as_str() {
                    "deck-import" | "compact-deck-import" => {
                        app.page = Page::Decks;
                        app.open_transfer(TransferKind::Deck);
                        let files = ["Стражи леса.brsd", "Пески Лаара.txt", "Дыхание бури.brsd"]
                            .iter()
                            .enumerate()
                            .map(|(index, name)| {
                                let elements = [[4, 8, 32], [1, 2, 32], [16, 4, 32]][index];
                                let cards: Vec<_> = elements
                                    .iter()
                                    .map(|element| {
                                        app.cat
                                            .cards
                                            .iter()
                                            .find(|c| c.alt.is_empty() && c.color == *element)
                                            .unwrap()
                                    })
                                    .collect();
                                let text = format!(
                                    "18 {}\n9 {}\n3 {}\n---side---\n2 {}",
                                    cards[0].id, cards[1].id, cards[2].id, cards[2].id
                                );
                                deck_import::DeckFile::parse(PathBuf::from(name), &text, &app.cat)
                            })
                            .collect();
                        let (tx, rx) = mpsc::channel();
                        app.file_result = Some(rx);
                        tx.send(Ok(Some(transfer::FileResult::Decks {
                            request: app.transfer.as_ref().unwrap().id.clone(),
                            files,
                        })))
                        .unwrap();
                    }
                    "restore-collection" => {
                        let path =
                            std::env::var_os("BERSERK_SMOKE_IMPORT_FILE").ok_or_else(|| {
                                std::io::Error::other("Missing smoke collection path")
                            })?;
                        let text = storage::read_import(&PathBuf::from(path))
                            .map_err(std::io::Error::other)?;
                        if transfer::restore_kind(&text, &app.cat).map_err(std::io::Error::other)?
                            != TransferKind::Collection
                        {
                            return Err(
                                std::io::Error::other("Expected a collection export").into()
                            );
                        }
                        app.open_transfer(TransferKind::Backup);
                        let (tx, rx) = mpsc::channel();
                        app.file_result = Some(rx);
                        tx.send(Ok(Some(transfer::FileResult::Single(
                            transfer::ImportedFile {
                                text,
                                name: "collection.brsc".into(),
                                action: transfer::FileAction::OpenCollection,
                            },
                        ))))
                        .unwrap();
                    }
                    "backup" | "compact-backup" => app.open_transfer(TransferKind::Backup),
                    "import" | "compact-import" | "import-empty" | "compact-import-replace" => {
                        app.open_transfer(TransferKind::Collection);
                        let transfer = app.transfer.as_mut().unwrap();
                        if smoke_view != "import-empty" {
                            transfer.text = app
                                .cat
                                .cards
                                .iter()
                                .take(400)
                                .map(|card| format!("{} 3", card.id))
                                .collect::<Vec<_>>()
                                .join("\n");
                            transfer.source = Some("collection.brsc".into());
                            transfer.merge = smoke_view != "compact-import-replace";
                            transfer.refresh_statistics(&app.cat);
                        }
                    }
                    "ai" | "compact-ai" => app.page = Page::CreateWithCodex,
                    "decks" | "deck" | "compact-deck" | "deck-full" | "compact-deck-full" => {
                        for (index, name) in ["Стражи леса", "Пески Лаара", "Дыхание бури"]
                            .iter()
                            .enumerate()
                        {
                            let mut deck = Deck::new(format!("smoke-{index}"), name.to_string());
                            // Mixed sets, editions, costs and repeated copies exercise the
                            // compact editor and keep the histogram visible in smoke captures.
                            let sample = [
                                "80010", "10020", "70007", "10007pf", "60003", "50010", "40001",
                                "30003", "20001", "10002",
                            ];
                            deck.cards = sample
                                .iter()
                                .cycle()
                                .skip(index)
                                .take(30)
                                .map(|id| (*id).to_string())
                                .collect();
                            deck.allowed_sets = Some(app.cat.set_ids());
                            if smoke_view.ends_with("-full") {
                                deck.side = vec!["10010".into(), "10010".into(), "80001".into()];
                            }
                            app.user.decks.push(deck);
                        }
                        app.page = Page::Decks;
                        if smoke_view != "decks" {
                            app.active = Some("smoke-0".into());
                            app.deck_full = smoke_view.ends_with("-full");
                        }
                    }
                    "hover" | "hover-plain" => {
                        app.smoke_pointer = Some(egui::pos2(420.0, 320.0));
                        if smoke_view == "hover-plain" {
                            app.settings.effects = false;
                        }
                    }
                    "reduced" => {
                        app.settings.reduced = true;
                        app.smoke_pointer = Some(egui::pos2(420.0, 320.0));
                    }
                    "detail" => app.detail = Some(app.cat.cards[0].id.clone()),
                    "list" | "compact-list" => app.settings.list = true,
                    _ => {}
                }
            }
            Ok(Box::new(app))
        }),
    )?;
    if smoke && let Some(path) = checked_report {
        let result = std::fs::read_to_string(path)?;
        if !result.starts_with("PASS:") {
            return Err(result.into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use eframe::App;
    fn fixture() -> (tempfile::TempDir, NativeApp, egui::Context) {
        let root = tempfile::tempdir().unwrap();
        let ctx = egui::Context::default();
        let cc = eframe::CreationContext::_new_kittest(ctx.clone());
        let app = NativeApp::new(
            &cc,
            root.path().into(),
            PathBuf::from(env!("CARGO_MANIFEST_DIR")),
            PathBuf::new(),
            None,
        )
        .unwrap();
        (root, app, ctx)
    }
    fn saved(app: &mut NativeApp, ctx: &egui::Context) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while app.pending.is_some() {
            assert!(Instant::now() < deadline);
            app.poll(ctx);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(storage::load(&app.store.path, &app.cat).unwrap(), app.user);
    }
    #[test]
    fn compact_deck_rows_stay_within_panel_and_top_navigation_saves_name() {
        let (_root, mut app, ctx) = fixture();
        let mut deck = Deck::new("compact".into(), "Колода".into());
        deck.cards = ["80010", "10020", "10007pf", "10002"]
            .iter()
            .cycle()
            .take(12)
            .map(|id| (*id).to_string())
            .collect();
        app.active = Some(deck.id.clone());
        app.user.decks.push(deck);
        app.page = Page::Decks;
        let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(850.0, 600.0));
        let mut target = None;
        for _ in 0..24 {
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ui| {
                    app.top(ui);
                    let panel = egui::Panel::right("test-deck")
                        .default_size(340.0)
                        .min_size(280.0)
                        .resizable(true)
                        .frame(egui::Frame::new().inner_margin(16))
                        .show(ui, |ui| app.deck_panel(ui));
                    assert!(
                        panel.response.rect.width() <= 341.0,
                        "rows widened the deck panel: {:?}",
                        panel.response.rect
                    );
                },
            );
            output.textures_delta.clear();
            for shape in &output.shapes {
                if let egui::epaint::Shape::Text(text) = &shape.shape {
                    let label = text.galley.text();
                    assert!(
                        ![
                            "Все колоды",
                            "Копия",
                            "Удалить",
                            "Импорт колод",
                            "Экспорт",
                            "Печать"
                        ]
                        .contains(&label)
                    );
                    if label == "Мои колоды" {
                        target = Some(text.galley.rect.translate(text.pos.to_vec2()).center());
                    }
                    if label == "Раздача" {
                        let rect = text.galley.rect.translate(text.pos.to_vec2());
                        assert!(
                            rect.top() > screen.bottom() - 100.0,
                            "deal action is pinned at the bottom"
                        );
                        assert!(shape.clip_rect.contains_rect(rect), "clipped deal action");
                    }
                    if label.starts_with('#') {
                        let rect = text.galley.rect.translate(text.pos.to_vec2());
                        assert!(shape.clip_rect.contains_rect(rect), "clipped card number");
                    }
                }
            }
        }
        app.rename = Some(("compact".into(), "Новое имя".into()));
        let pos = target.expect("top deck navigation");
        for pressed in [true, false] {
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(screen),
                    events: vec![
                        egui::Event::PointerMoved(pos),
                        egui::Event::PointerButton {
                            pos,
                            button: egui::PointerButton::Primary,
                            pressed,
                            modifiers: egui::Modifiers::NONE,
                        },
                    ],
                    ..Default::default()
                },
                |ui| app.top(ui),
            );
            output.textures_delta.clear();
        }
        assert!(app.active.is_none(), "top navigation opens the library");
        saved(&mut app, &ctx);
        assert_eq!(app.user.decks[0].name, "Новое имя");
        assert!(app.active.is_none(), "saving must not reopen the editor");
    }

    #[test]
    fn library_delete_requires_confirmation_and_supports_undo() {
        let (_root, mut app, ctx) = fixture();
        app.page = Page::Decks;
        app.user.decks = vec![
            Deck::new("first".into(), "Первая колода".into()),
            Deck::new("second".into(), "Вторая колода".into()),
        ];
        let before = app.user.clone();
        let render = |app: &mut NativeApp, events| {
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(850.0, 600.0),
                    )),
                    events,
                    ..Default::default()
                },
                |ui| {
                    egui::CentralPanel::default().show(ui, |ui| app.deck_library(ui));
                    app.delete_window(&ctx);
                },
            );
            output.textures_delta.clear();
            output
        };
        let click = |app: &mut NativeApp, pos| {
            for pressed in [true, false] {
                render(
                    app,
                    vec![
                        egui::Event::PointerMoved(pos),
                        egui::Event::PointerButton {
                            pos,
                            button: egui::PointerButton::Primary,
                            pressed,
                            modifiers: egui::Modifiers::NONE,
                        },
                    ],
                );
            }
        };
        render(&mut app, vec![]);
        let output = render(&mut app, vec![]);
        let delete_positions = |output: &egui::FullOutput| {
            output
                .shapes
                .iter()
                .filter_map(|shape| {
                    if let egui::epaint::Shape::Text(text) = &shape.shape
                        && text.galley.text() == "Удалить"
                    {
                        Some(text.galley.rect.translate(text.pos.to_vec2()).center())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        };
        let positions = delete_positions(&output);
        assert_eq!(positions.len(), 2, "each library tile has a delete action");
        click(&mut app, positions[0]);
        assert_eq!(app.delete.as_deref(), Some("first"));
        assert_eq!(
            app.user, before,
            "opening confirmation cannot delete a deck"
        );
        render(&mut app, vec![]);
        let output = render(&mut app, vec![]);
        let confirm = *delete_positions(&output)
            .last()
            .expect("confirmation action");
        click(&mut app, confirm);
        saved(&mut app, &ctx);
        assert_eq!(app.user.decks.len(), 1);
        assert_eq!(app.user.decks[0].id, "second");
        app.undo();
        saved(&mut app, &ctx);
        assert_eq!(app.user, before);
    }

    #[test]
    fn detailed_deck_toggle_shows_only_deck_and_reserve_and_preserves_filters() {
        let (_root, mut app, ctx) = fixture();
        let mut deck = Deck::new("overview".into(), "Подробная колода".into());
        deck.cards = vec!["10002".into(); 3];
        deck.side = vec!["80010".into(); 2];
        app.user.decks.push(deck);
        app.page = Page::Decks;
        app.active = Some("overview".into());
        app.filter.query = "no matching cards".into();
        let before = app.user.clone();
        let filter = app.filter.clone();
        let mut frame = eframe::Frame::_new_kittest();
        let mut render = |app: &mut NativeApp, events| {
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(1280.0, 860.0),
                    )),
                    events,
                    ..Default::default()
                },
                |ui| app.ui(ui, &mut frame),
            );
            output.textures_delta.clear();
            output
        };
        let text_rect = |output: &egui::FullOutput, label: &str| {
            output.shapes.iter().find_map(|shape| {
                if let egui::epaint::Shape::Text(text) = &shape.shape
                    && text.galley.text() == label
                {
                    Some(text.galley.rect.translate(text.pos.to_vec2()))
                } else {
                    None
                }
            })
        };
        render(&mut app, vec![]);
        let output = render(&mut app, vec![]);
        assert_eq!(app.visible_cards, 0, "catalog filter excludes every card");
        let button = text_rect(&output, "Подробно").expect("detail toggle");
        for pressed in [true, false] {
            render(
                &mut app,
                vec![
                    egui::Event::PointerMoved(button.center()),
                    egui::Event::PointerButton {
                        pos: button.center(),
                        button: egui::PointerButton::Primary,
                        pressed,
                        modifiers: egui::Modifiers::NONE,
                    },
                ],
            );
        }
        assert!(app.deck_full);
        render(&mut app, vec![]);
        let output = render(&mut app, vec![]);
        assert_eq!(
            app.visible_cards, 2,
            "gallery includes deck and reserve despite catalog filters"
        );
        assert!(text_rect(&output, "Запас · 2").is_some());
        assert!(text_rect(&output, "×3").is_some());
        assert!(text_rect(&output, "Отбор карт").is_none());
        assert!(text_rect(&output, "Книга карт").is_none());
        assert_eq!(app.user, before);
        let button = text_rect(&output, "Карты").expect("return to catalog");
        for pressed in [true, false] {
            render(
                &mut app,
                vec![
                    egui::Event::PointerMoved(button.center()),
                    egui::Event::PointerButton {
                        pos: button.center(),
                        button: egui::PointerButton::Primary,
                        pressed,
                        modifiers: egui::Modifiers::NONE,
                    },
                ],
            );
        }
        assert!(!app.deck_full);
        render(&mut app, vec![]);
        let output = render(&mut app, vec![]);
        assert!(text_rect(&output, "Отбор карт").is_some());
        assert_eq!(app.filter, filter);
        assert_eq!(app.user, before);
        assert!(
            app.pending.is_none(),
            "view switching must not modify the deck"
        );
    }

    #[test]
    fn deck_batch_preview_save_undo_and_stale_picker_results() {
        let (_root, mut app, ctx) = fixture();
        app.own(&app.cat.cards[0].id.clone(), 2);
        saved(&mut app, &ctx);
        let before = app.user.clone();
        app.open_transfer(TransferKind::Deck);
        let request = app.transfer.as_ref().unwrap().id.clone();
        let deliver = |app: &mut NativeApp, request: &str, names: &[&str]| {
            let files = names
                .iter()
                .map(|name| {
                    deck_import::DeckFile::parse(
                        PathBuf::from(name),
                        &format!("2 {}", app.cat.cards[0].id),
                        &app.cat,
                    )
                })
                .collect();
            let (tx, rx) = mpsc::channel();
            app.file_result = Some(rx);
            tx.send(Ok(Some(transfer::FileResult::Decks {
                request: request.into(),
                files,
            })))
            .unwrap();
            app.poll_file();
        };
        deliver(&mut app, &request, &["one.txt", "two.brsd"]);
        assert_eq!(app.transfer.as_ref().unwrap().decks.len(), 2);
        assert_eq!(app.user, before);
        assert!(app.pending.is_none());
        deliver(&mut app, &request, &["one.txt"]);
        assert_eq!(
            app.transfer.as_ref().unwrap().decks.len(),
            2,
            "reselecting refreshes, never duplicates"
        );
        let mut transfer = app.transfer.take().unwrap();
        assert!(app.apply_deck_import(&mut transfer));
        assert_eq!(
            app.user, before,
            "no changes before durable acknowledgement"
        );
        saved(&mut app, &ctx);
        assert_eq!(app.user.decks.len(), 2);
        assert_eq!(app.user.decks[0].name, "one");
        assert_eq!(app.user.decks[1].name, "two");
        assert_eq!(app.user.collection, before.collection);
        app.undo();
        saved(&mut app, &ctx);
        assert_eq!(app.user, before, "one undo removes the whole batch");
        app.open_transfer(TransferKind::Deck);
        deliver(&mut app, &request, &["late.txt"]);
        assert!(app.transfer.as_ref().unwrap().decks.is_empty());
        app.transfer = None;
        deliver(&mut app, &request, &["closed.txt"]);
        assert!(app.transfer.is_none());
        assert_eq!(app.user, before);
    }
    #[test]
    fn deck_import_statistics_and_footer_fit_compact_window() {
        let (_root, mut app, ctx) = fixture();
        let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(850.0, 600.0));
        for invalid in [false, true] {
            app.open_transfer(TransferKind::Deck);
            app.transfer.as_mut().unwrap().decks = (0..100)
                .map(|index| {
                    deck_import::DeckFile::parse(
                        PathBuf::from(format!("Колода {index}.brsd")),
                        &if invalid && index == 99 {
                            "1 missing".into()
                        } else {
                            format!("3 {}", app.cat.cards[0].id)
                        },
                        &app.cat,
                    )
                })
                .collect();
            for _ in 0..4 {
                let mut output = ctx.run_ui(
                    egui::RawInput {
                        screen_rect: Some(screen),
                        ..Default::default()
                    },
                    |ui| app.transfer_window(ui.ctx()),
                );
                output.textures_delta.clear();
            }
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ui| app.transfer_window(ui.ctx()),
            );
            output.textures_delta.clear();
            for label in [
                "Импортировать (100)",
                "Отмена",
                "Степи",
                "Горы",
                "Леса",
                "Болота",
                "Тьма",
                "Нейтралы",
            ] {
                let (clip, rect) = output
                    .shapes
                    .iter()
                    .find_map(|shape| {
                        if let egui::epaint::Shape::Text(text) = &shape.shape
                            && text.galley.text() == label
                        {
                            Some((
                                shape.clip_rect,
                                text.galley.rect.translate(text.pos.to_vec2()),
                            ))
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| panic!("missing {label}"));
                assert!(screen.contains_rect(rect), "offscreen {label}");
                assert!(clip.contains_rect(rect), "clipped {label}");
            }
            let texts: Vec<_> = output
                .shapes
                .iter()
                .filter_map(|shape| {
                    if let egui::epaint::Shape::Text(text) = &shape.shape {
                        Some(text.galley.text())
                    } else {
                        None
                    }
                })
                .collect();
            assert!(
                !texts.iter().any(|text| text.contains("Колода 99")),
                "offscreen previews should not render"
            );
            assert!(
                !texts.iter().any(|text| text.contains(&app.cat.cards[0].id)),
                "raw deck text must not render"
            );
        }
    }
    #[test]
    fn restore_collection_opens_statistics_without_changing_saved_data() {
        let (_root, mut app, ctx) = fixture();
        app.own(&app.cat.cards[0].id.clone(), 2);
        saved(&mut app, &ctx);
        let before = app.user.clone();
        app.open_transfer(TransferKind::Backup);
        let (tx, rx) = mpsc::channel();
        app.file_result = Some(rx);
        let text = include_str!("../../tests/fixtures/upstream-collection.brsc");
        tx.send(Ok(Some(transfer::FileResult::Single(
            transfer::ImportedFile {
                text: text.into(),
                name: "collection.brsk".into(),
                action: transfer::FileAction::OpenCollection,
            },
        ))))
        .unwrap();
        app.poll(&ctx);
        let dialog = app.transfer.as_ref().unwrap();
        assert!(dialog.kind == TransferKind::Collection);
        assert!(dialog.statistics.as_ref().unwrap().is_ok());
        assert!(dialog.merge);
        assert_eq!(dialog.text, text);
        assert_eq!(app.user, before);
        assert!(app.pending.is_none());
        assert_eq!(storage::load(&app.store.path, &app.cat).unwrap(), before);
    }
    #[test]
    fn confirmed_backup_restore_is_durable_undoable_and_rejects_invalid_data() {
        let (_root, mut app, ctx) = fixture();
        let id = app.cat.cards[0].id.clone();
        app.own(&id, 2);
        saved(&mut app, &ctx);
        let before = app.user.clone();
        let mut restored = before.clone();
        restored.set_count(&id, 7);
        restored.favorites.insert(id);
        restored
            .decks
            .push(Deck::new("restored".into(), "Restored".into()));
        let deliver = |app: &mut NativeApp, text: String, confirmed: bool| {
            let (tx, rx) = mpsc::channel();
            app.file_result = Some(rx);
            tx.send(Ok(Some(transfer::FileResult::Single(
                transfer::ImportedFile {
                    text,
                    name: "backup.json".into(),
                    action: if confirmed {
                        transfer::FileAction::RestoreBackup
                    } else {
                        transfer::FileAction::Import
                    },
                },
            ))))
            .unwrap();
            app.poll(&ctx);
        };
        app.open_transfer(TransferKind::Backup);
        deliver(&mut app, serde_json::to_string(&restored).unwrap(), false);
        assert_eq!(
            app.user, before,
            "a file alone does not authorize replacement"
        );
        assert!(app.pending.is_none());
        deliver(&mut app, serde_json::to_string(&restored).unwrap(), true);
        assert_eq!(
            app.user, before,
            "restore commits only after durable storage"
        );
        saved(&mut app, &ctx);
        assert_eq!(app.user, restored);
        assert!(app.transfer.is_none());
        app.undo();
        saved(&mut app, &ctx);
        assert_eq!(app.user, before);
        app.open_transfer(TransferKind::Backup);
        deliver(&mut app, "invalid JSON".into(), true);
        assert_eq!(app.user, before);
        assert!(app.pending.is_none());
        assert!(!app.transfer.as_ref().unwrap().error.is_empty());
        app.open_transfer(TransferKind::Collection);
        deliver(&mut app, serde_json::to_string(&restored).unwrap(), true);
        assert!(
            app.transfer.as_ref().unwrap().text.is_empty(),
            "late restore results cannot populate another dialog"
        );
        assert_eq!(app.user, before);
    }
    #[test]
    fn collection_import_statistics_and_actions_fit_minimum_window_size() {
        let (_root, mut app, ctx) = fixture();
        let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(850.0, 600.0));
        for merge in [false, true] {
            app.open_transfer(TransferKind::Collection);
            let transfer = app.transfer.as_mut().unwrap();
            transfer.text = app
                .cat
                .cards
                .iter()
                .map(|c| format!("{} 3", c.id))
                .collect::<Vec<_>>()
                .join("\n");
            transfer.merge = merge;
            transfer.refresh_statistics(&app.cat);
            for _ in 0..4 {
                let mut output = ctx.run_ui(
                    egui::RawInput {
                        screen_rect: Some(screen),
                        ..Default::default()
                    },
                    |ui| app.transfer_window(ui.ctx()),
                );
                output.textures_delta.clear();
            }
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ui| app.transfer_window(ui.ctx()),
            );
            output.textures_delta.clear();
            for label in [
                "Импортировать",
                "Отмена",
                "Добавить к коллекции",
                "Заменить коллекцию",
                "Частая",
                "Необычная",
                "Редкая",
                "Ультраредкая",
            ] {
                let text = output
                    .shapes
                    .iter()
                    .find_map(|s| {
                        if let egui::epaint::Shape::Text(t) = &s.shape
                            && t.galley.text() == label
                        {
                            Some((s.clip_rect, t.galley.rect.translate(t.pos.to_vec2())))
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| panic!("missing {label}, merge={merge}"));
                assert!(
                    screen.contains_rect(text.1),
                    "offscreen {label}: {:?}",
                    text.1
                );
                assert!(text.0.contains_rect(text.1), "clipped {label}: {:?}", text);
            }
        }
    }
    #[test]
    fn codex_status_and_creation_action_fit_compact_window() {
        let (_root, mut app, ctx) = fixture();
        let mut frame = eframe::Frame::_new_kittest();
        let screen = egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(850.0, 600.0));
        // Keep this layout check entirely offline, without launching a real CLI/service.
        let (_tx, incoming) = mpsc::channel();
        let (outgoing, _rx) = mpsc::channel();
        app.bridge = Some(Bridge::for_test(incoming, outgoing));
        app.connected = true;
        app.page = Page::CreateWithCodex;
        for status in [
            codex_auth::Status::SignedIn,
            codex_auth::Status::SignedOut,
            codex_auth::Status::Missing,
            codex_auth::Status::Failed,
        ] {
            app.codex_auth = codex_auth::Auth::cached_for_test(status);
            for _ in 0..4 {
                let mut output = ctx.run_ui(
                    egui::RawInput {
                        screen_rect: Some(screen),
                        ..Default::default()
                    },
                    |ui| app.ui(ui, &mut frame),
                );
                output.textures_delta.clear();
            }
            let mut output = ctx.run_ui(
                egui::RawInput {
                    screen_rect: Some(screen),
                    ..Default::default()
                },
                |ui| app.ui(ui, &mut frame),
            );
            output.textures_delta.clear();
            for label in [status.label(), "Проверить вход", "Создать колоду"]
            {
                let (clip, rect) = output
                    .shapes
                    .iter()
                    .find_map(|shape| {
                        if let egui::epaint::Shape::Text(text) = &shape.shape
                            && text.galley.text() == label
                        {
                            Some((
                                shape.clip_rect,
                                text.galley.rect.translate(text.pos.to_vec2()),
                            ))
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| panic!("missing {label}"));
                assert!(screen.contains_rect(rect), "offscreen {label}: {rect:?}");
                assert!(clip.contains_rect(rect), "clipped {label}: {rect:?}");
            }
            assert!(
                !app.codex_auth.checking(),
                "cached status does not spawn a CLI check"
            );
        }
        app.progress.phase = "running".into();
        app.progress.message = "Длинное сообщение о ходе генерации. ".repeat(300);
        let mut output = ctx.run_ui(
            egui::RawInput {
                screen_rect: Some(screen),
                ..Default::default()
            },
            |ui| app.ui(ui, &mut frame),
        );
        output.textures_delta.clear();
        let (clip, rect) = output
            .shapes
            .iter()
            .find_map(|shape| {
                if let egui::epaint::Shape::Text(text) = &shape.shape
                    && text.galley.text() == "Отменить генерацию"
                {
                    Some((
                        shape.clip_rect,
                        text.galley.rect.translate(text.pos.to_vec2()),
                    ))
                } else {
                    None
                }
            })
            .expect("generation cancel action is visible");
        assert!(screen.contains_rect(rect) && clip.contains_rect(rect));
    }
    #[test]
    fn local_login_status_does_not_block_an_external_service() {
        let (_root, mut app, _ctx) = fixture();
        app.connected = true;
        app.user.set_count(&app.cat.cards[0].id, 30);
        app.codex_auth = codex_auth::Auth::cached_for_test(codex_auth::Status::SignedOut);
        assert!(app.ai_blocker(false).unwrap().contains("Войдите"));
        app.external_service = true;
        assert_eq!(app.ai_blocker(false), None);
        app.external_service = false;
        app.codex_auth.status = codex_auth::Status::Failed;
        assert_eq!(
            app.ai_blocker(false),
            None,
            "a check error is not evidence of logout"
        );
        app.codex_auth.status = codex_auth::Status::SignedIn;
        assert_eq!(app.ai_blocker(false), None);
    }
    #[test]
    fn codex_creation_explains_empty_collection_and_recovers_after_save() {
        let (_root, mut app, ctx) = fixture();
        app.connected = true;
        let id = app.cat.cards[0].id.clone();
        // Zero-count records remain after removing the last owned copy.
        app.user.set_count(&id, 0);
        assert!(
            app.ai_blocker(false)
                .unwrap()
                .contains("В коллекции нет карт")
        );
        app.own(&id, 1);
        assert!(app.ai_blocker(false).unwrap().contains("сохранения"));
        saved(&mut app, &ctx);
        assert_eq!(app.ai_blocker(false), None);
        app.settings.allowed_sets.clear();
        assert!(app.ai_blocker(false).unwrap().contains("набор"));
        app.settings.allowed_sets = app.cat.set_ids();
        app.connected = false;
        assert!(app.ai_blocker(false).unwrap().contains("подключение"));
        app.connected = true;
        app.progress.phase = "running".into();
        assert!(app.ai_blocker(false).unwrap().contains("уже работает"));
        app.progress.phase = "failed".into();
        assert_eq!(app.ai_blocker(false), None);
        app.undo();
        saved(&mut app, &ctx);
        assert!(
            app.ai_blocker(false)
                .unwrap()
                .contains("В коллекции нет карт")
        );
        app.feedback = "Изменить стратегию".into();
        assert_eq!(
            app.ai_blocker(true),
            None,
            "discussion does not need owned cards"
        );
        app.feedback.clear();
        assert!(app.ai_blocker(true).unwrap().contains("Напишите"));
    }
    #[test]
    fn editing_undo_and_reopen_are_durable() {
        let (_root, mut app, ctx) = fixture();
        let id = app.cat.cards[0].id.clone();
        app.own(&id, 2);
        assert_eq!(
            app.user.count(&id),
            0,
            "uncommitted changes are not acknowledged"
        );
        saved(&mut app, &ctx);
        assert_eq!(app.user.count(&id), 2);
        app.favorite(&id);
        saved(&mut app, &ctx);
        assert!(app.user.favorites.contains(&id));
        app.undo();
        saved(&mut app, &ctx);
        assert!(!app.user.favorites.contains(&id));
        app.undo();
        saved(&mut app, &ctx);
        assert_eq!(app.user.count(&id), 0);
    }
    #[test]
    fn set_restrictions_and_disk_errors_leave_last_state_intact() {
        let (_root, mut app, ctx) = fixture();
        let card = app.cat.cards[0].clone();
        let mut deck = Deck::new("test".into(), "Test".into());
        deck.cards.push(card.id.clone());
        deck.allowed_sets = Some(vec![card.set_id]);
        app.change(|u| u.decks.push(deck));
        saved(&mut app, &ctx);
        app.active = Some("test".into());
        let other = app
            .cat
            .set_ids()
            .into_iter()
            .find(|id| *id != card.set_id)
            .unwrap();
        app.edit_deck(|d| d.allowed_sets = Some(vec![other]));
        assert!(app.pending.is_none());
        assert_eq!(app.deck().unwrap().allowed_sets, Some(vec![card.set_id]));
        // A directory at the destination makes atomic replacement fail on every OS.
        std::fs::remove_file(&app.store.path).unwrap();
        std::fs::create_dir(&app.store.path).unwrap();
        let before = app.user.clone();
        app.own(&card.id, 1);
        let deadline = Instant::now() + Duration::from_secs(5);
        while app.pending.is_some() {
            assert!(Instant::now() < deadline);
            app.poll(&ctx);
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(app.user, before);
        assert!(app.status.contains("не удалось"));
    }
    #[test]
    fn native_views_virtualize_and_cache_search() {
        let (_root, mut app, ctx) = fixture();
        app.settings.effects = false;
        let mut frame = eframe::Frame::_new_kittest();
        let input = || egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(
                egui::Pos2::ZERO,
                egui::vec2(1280.0, 860.0),
            )),
            ..Default::default()
        };
        for _ in 0..3 {
            ctx.run_ui(input(), |ui| app.ui(ui, &mut frame))
                .textures_delta
                .clear();
        }
        assert!(app.filtered.len() > 2500);
        assert!(
            app.visible_cards > 0 && app.visible_cards < 24,
            "only visible card tiles are created: {}",
            app.visible_cards
        );
        let search = app.search_ms;
        let start = Instant::now();
        for _ in 0..100 {
            ctx.run_ui(input(), |ui| app.ui(ui, &mut frame))
                .textures_delta
                .clear();
        }
        assert_eq!(search, app.search_ms, "idle redraws must not rerun search");
        eprintln!(
            "Native 1280x860 headless UI: {:.3} ms/frame; search {:.3} ms; visible tiles {}; catalog records {}",
            start.elapsed().as_secs_f64() * 10.0,
            search,
            app.visible_cards,
            app.filtered.len()
        );
        app.page = Page::Decks;
        app.active = None;
        ctx.run_ui(input(), |ui| app.ui(ui, &mut frame))
            .textures_delta
            .clear();
        app.detail = Some(app.cat.cards[0].id.clone());
        app.open_transfer(TransferKind::Backup);
        ctx.run_ui(input(), |ui| app.ui(ui, &mut frame))
            .textures_delta
            .clear();
    }
}

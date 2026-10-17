use berserk_leptos::{formats, model::*};
use leptos::prelude::*;
use std::sync::Arc;
use wasm_bindgen::JsCast;

pub(crate) const STORAGE: &str = "berserk-leptos-v1";
const ALLOWED_SETS_STORAGE: &str = "berserk-default-allowed-sets-v1";
#[derive(Clone, Copy, PartialEq)]
pub enum Page {
    Catalog,
    Collection,
    Decks,
}
impl Page {
    fn title(self) -> &'static str {
        match self {
            Self::Catalog => "Энциклопедия",
            Self::Collection => "Моя коллекция",
            Self::Decks => "Мои колоды",
        }
    }
    fn hash(self) -> &'static str {
        match self {
            Self::Catalog => "catalog",
            Self::Collection => "collection",
            Self::Decks => "decks",
        }
    }
    fn from_hash() -> Self {
        match web_sys::window()
            .and_then(|w| w.location().hash().ok())
            .unwrap_or_default()
            .as_str()
        {
            "#collection" => Self::Collection,
            "#decks" => Self::Decks,
            _ => Self::Catalog,
        }
    }
}
#[derive(Clone, Copy, PartialEq)]
pub enum IoMode {
    Backup,
    Collection,
    Deck,
}
#[derive(Clone, Copy)]
pub struct Ctx {
    pub catalog: StoredValue<Arc<Catalog>>,
    pub user: RwSignal<UserData>,
    pub page: RwSignal<Page>,
    pub active: RwSignal<Option<String>>,
    pub detail: RwSignal<Option<String>>,
    pub new_deck_draft: RwSignal<Option<Deck>>,
    pub default_allowed_sets: RwSignal<Vec<u16>>,
    pub toast: RwSignal<String>,
    pub io: RwSignal<Option<IoMode>>,
    pub side: RwSignal<bool>,
    pub storage_ok: RwSignal<bool>,
    pub undo: RwSignal<Vec<UserData>>,
    pub agent_connected: RwSignal<bool>,
    pub build_event: RwSignal<Option<berserk_leptos::agent::BuildEvent>>,
    pub build_progress: RwSignal<berserk_leptos::agent::BuildProgress>,
}
impl Ctx {
    pub fn cat(self) -> Arc<Catalog> {
        self.catalog.get_value()
    }
    pub fn change(self, f: impl FnOnce(&mut UserData)) {
        let previous = self.user.get_untracked();
        let mut next = previous.clone();
        f(&mut next);
        for deck in &next.decks {
            if let Err(error) = deck.validate_sets(&self.cat()) {
                self.toast.set(error);
                return;
            }
        }
        self.undo.update(|v| {
            if v.len() >= 30 {
                v.remove(0);
            }
            v.push(previous);
        });
        self.user.set(next);
    }
    pub fn navigate(self, page: Page) {
        self.page.set(page);
        if let Some(w) = web_sys::window() {
            let _ = w.location().set_hash(page.hash());
        }
    }
    pub fn remember_allowed_sets(self, sets: Vec<u16>) {
        if validate_allowed_sets(Some(&sets), &self.cat()).is_ok() {
            self.default_allowed_sets.set(sets);
        }
    }
    pub fn new_deck(self, name: String, cards: Vec<String>, side: Vec<String>, tag: &str) {
        let mut deck = Deck::new(new_id(), name);
        deck.cards = cards;
        deck.side = side;
        deck.tags = vec![tag.into()];
        deck.allowed_sets = Some(self.default_allowed_sets.get_untracked());
        self.detail.set(None);
        self.new_deck_draft.set(Some(deck));
    }
    pub fn deck(self) -> Option<Deck> {
        let id = self.active.get();
        self.user
            .with(|u| u.decks.iter().find(|d| Some(&d.id) == id.as_ref()).cloned())
    }
    pub fn copy_deck(self) {
        if let Some(mut deck) = self.deck_untracked() {
            deck.id = new_id();
            deck.agent_session = None;
            deck.name = format!("{} — копия", deck.name);
            let id = deck.id.clone();
            self.change(|u| u.decks.insert(0, deck));
            self.active.set(Some(id));
            self.side.set(false);
        }
    }
    pub fn deck_untracked(self) -> Option<Deck> {
        untrack(|| self.deck())
    }
    pub fn edit_deck(self, f: impl FnOnce(&mut Deck)) {
        let id = self.active.get_untracked();
        self.change(|u| {
            if let Some(d) = u.decks.iter_mut().find(|d| Some(&d.id) == id.as_ref()) {
                f(d);
            }
        });
    }
    pub fn add_card(self, id: &str) {
        if self.active.get_untracked().is_none() {
            self.new_deck(
                "Новая колода".into(),
                vec![id.into()],
                vec![],
                "Констрактед",
            );
        } else {
            let side = self.side.get_untracked();
            self.edit_deck(|d| d.add(id, side));
        }
    }
    pub fn own(self, id: &str, delta: i32) {
        self.change(|u| {
            let n = u.count(id);
            u.set_count(id, n.saturating_add_signed(delta));
        });
    }
    pub fn favorite(self, id: &str) {
        self.change(|u| {
            if !u.favorites.remove(id) {
                u.favorites.insert(id.into());
            }
        });
    }
}
pub fn new_id() -> String {
    format!(
        "{:x}-{:x}",
        js_sys::Date::now() as u64,
        (js_sys::Math::random() * u32::MAX as f64) as u32
    )
}
pub fn seed() -> u64 {
    js_sys::Date::now() as u64 ^ (js_sys::Math::random() * u32::MAX as f64) as u64
}
pub fn download(name: &str, text: &str, mime: &str) -> Result<(), String> {
    let err = |_: wasm_bindgen::JsValue| "Не удалось скачать файл".to_string();
    let parts = js_sys::Array::new();
    parts.push(&wasm_bindgen::JsValue::from_str(text));
    let options = web_sys::BlobPropertyBag::new();
    options.set_type(mime);
    let blob = web_sys::Blob::new_with_str_sequence_and_options(&parts, &options).map_err(err)?;
    let url = web_sys::Url::create_object_url_with_blob(&blob).map_err(err)?;
    let doc = document();
    let a = doc
        .create_element("a")
        .map_err(err)?
        .dyn_into::<web_sys::HtmlAnchorElement>()
        .map_err(|_| "Не удалось создать ссылку")?;
    a.set_href(&url);
    a.set_download(name);
    a.set_attribute("style", "display:none").map_err(err)?;
    doc.body()
        .ok_or("Нет документа")?
        .append_child(&a)
        .map_err(err)?;
    a.click();
    a.remove();
    set_timeout(
        move || {
            let _ = web_sys::Url::revoke_object_url(&url);
        },
        std::time::Duration::from_secs(5),
    );
    Ok(())
}
pub fn save_file(ctx: Ctx, name: &str, text: String, mime: &str) {
    if crate::desktop::save(name, &text) {
        return;
    }
    match download(name, &text, mime) {
        Ok(()) => ctx.toast.set("Файл готов к сохранению".into()),
        Err(e) => ctx.toast.set(e),
    }
}

#[component]
pub fn App() -> impl IntoView {
    let catalog = Arc::new(Catalog::load().expect("The bundled card catalog must be valid"));
    let mut load_error = String::new();
    let initial = (|| -> Result<UserData, String> {
        let store = window()
            .local_storage()
            .map_err(|_| "Хранилище данных недоступно")?
            .ok_or("Хранилище данных недоступно")?;
        let Some(raw) = store
            .get_item(STORAGE)
            .map_err(|_| "Не удалось прочитать сохранение")?
        else {
            return Ok(UserData::default());
        };
        let user: UserData = serde_json::from_str(&raw)
            .map_err(|_| "Сохранение повреждено. Исходные данные не перезаписаны.")?;
        user.validate(&catalog)?;
        Ok(user)
    })()
    .unwrap_or_else(|e| {
        load_error = e;
        UserData::default()
    });
    let default_allowed_sets = window()
        .local_storage()
        .ok()
        .flatten()
        .and_then(|store| store.get_item(ALLOWED_SETS_STORAGE).ok().flatten())
        .and_then(|raw| serde_json::from_str::<Vec<u16>>(&raw).ok())
        .filter(|sets| validate_allowed_sets(Some(sets), &catalog).is_ok())
        .unwrap_or_else(|| catalog.set_ids());
    let ctx = Ctx {
        catalog: StoredValue::new(catalog),
        active: RwSignal::new(initial.decks.first().map(|d| d.id.clone())),
        user: RwSignal::new(initial),
        page: RwSignal::new(Page::from_hash()),
        detail: RwSignal::new(None),
        new_deck_draft: RwSignal::new(None),
        default_allowed_sets: RwSignal::new(default_allowed_sets),
        toast: RwSignal::new(load_error.clone()),
        io: RwSignal::new(None),
        side: RwSignal::new(false),
        storage_ok: RwSignal::new(load_error.is_empty()),
        undo: RwSignal::new(vec![]),
        agent_connected: RwSignal::new(false),
        build_event: RwSignal::new(None),
        build_progress: RwSignal::new(Default::default()),
    };
    provide_context(ctx);
    on_cleanup(crate::foil::shutdown);
    Effect::new(move |_| {
        let sets = ctx.default_allowed_sets.get();
        if let Some(store) = window().local_storage().ok().flatten()
            && let Ok(raw) = serde_json::to_string(&sets)
            && store.set_item(ALLOWED_SETS_STORAGE, &raw).is_err()
        {
            ctx.toast
                .set("Не удалось запомнить разрешённые наборы для новых колод.".into());
        }
    });
    Effect::new(move |_| {
        let user = ctx.user.get();
        if ctx.storage_ok.get() {
            let result = window()
                .local_storage()
                .ok()
                .flatten()
                .ok_or(())
                .and_then(|s| {
                    serde_json::to_string(&user)
                        .map_err(|_| ())
                        .and_then(|json| s.set_item(STORAGE, &json).map_err(|_| ()))
                });
            if result.is_err() {
                ctx.storage_ok.set(false);
                ctx.toast
                    .set("Не удалось сохранить данные. Скачайте резервную копию.".into());
            }
        }
    });
    let _ = window_event_listener(leptos::ev::hashchange, move |_| {
        ctx.page.set(Page::from_hash())
    });
    let _ = window_event_listener(leptos::ev::keydown, move |e| {
        if e.key() == "Escape" {
            ctx.detail.set(None);
            ctx.new_deck_draft.set(None);
            ctx.io.set(None);
        }
    });
    view! {
        <header class="topbar">
            <a class="brand" href="#catalog" on:click=move |_|ctx.navigate(Page::Catalog)><span class="brand-symbol">"Б"</span><span>"БЕРСЕРК"<small>"КАРТОЧНАЯ ЭНЦИКЛОПЕДИЯ"</small></span></a>
            <nav aria-label="Основная навигация">{[Page::Catalog,Page::Collection,Page::Decks].into_iter().map(|p|view!{
                <a href=format!("#{}",p.hash()) class:active=move||ctx.page.get()==p on:click=move |_|ctx.navigate(p)>{p.title()}</a>
            }).collect_view()}</nav>
            <button class="backup-button" title="Резервная копия и импорт" on:click=move |_|ctx.io.set(Some(IoMode::Backup))><Icon name="save"/><span>"Мои данные"</span></button>
        </header>
        <Show when=move||!ctx.storage_ok.get()><div class="storage-warning">"Автосохранение недоступно. Экспортируйте данные через «Мои данные»."<button on:click=move |_|{if window().confirm_with_message("Разрешить сохранение текущих данных? Предыдущее сохранение будет заменено.").unwrap_or(false){ctx.storage_ok.set(true);}}>"Повторить сохранение"</button></div></Show>
        <crate::agent_ui::AgentConnection/>
        <Show when=move || crate::desktop::available() && ctx.user.with(|u| u.total()==0 && u.decks.is_empty())>
            <section class="agent-connection"><span>"Коллекция осталась в браузере? Скачайте там резервную копию через «Мои данные», затем импортируйте её сюда."</span><button class="button" on:click=move |_|ctx.io.set(Some(IoMode::Backup))>"Перенести данные"</button></section>
        </Show>
        <main>{move||match ctx.page.get(){
            Page::Catalog=>view!{<CatalogPage collection=false/>}.into_any(),
            Page::Collection=>view!{<CatalogPage collection=true/>}.into_any(),
            Page::Decks=>view!{<crate::decks::DecksPage/>}.into_any(),
        }}</main>
        <footer class="site-footer"><span>"БЕРСЕРК · Мир Лаара в вашей коллекции"</span><span>"На основе "<a href="https://github.com/SkAZi/berserk-nxt" target="_blank" rel="noreferrer">"berserk-nxt"</a>" · Rust + Leptos"</span></footer>
        <Show when=move||!ctx.toast.get().is_empty()><div class="toast" role="status"><span>{move||ctx.toast.get()}</span><button aria-label="Закрыть уведомление" on:click=move |_|ctx.toast.set(String::new())>"×"</button></div></Show>
        {move||ctx.new_deck_draft.get().map(|deck|view!{<crate::decks::NewDeckDialog deck/>})}
        {move||ctx.detail.get().and_then(|id|ctx.cat().get(&id).cloned()).map(|card|view!{<CardDetail card/>})}
        {move||ctx.io.get().map(|mode|view!{<TransferDialog mode/>})}
    }
}
#[component]
pub fn Icon(#[prop(default = "grid")] name: &'static str) -> impl IntoView {
    let path = match name {
        "search" => "m21 21-4.3-4.3 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
        "save" => "M12 3v12m-4-4 4 4 4-4 M4 15v5h16v-5",
        "plus" => "M12 5v14M5 12h14",
        "list" => "M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1",
        "star" => "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
        "arrow" => "M5 12h14m-5-5 5 5-5 5",
        "filter" => "M4 6h16M7 12h10M10 18h4",
        _ => "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
    };
    view! {<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=path/></svg>}
}
#[component]
pub fn CatalogPage(collection: bool) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let catalog = ctx.cat();
    let filter = RwSignal::new(Filter {
        owned: if collection {
            "owned".into()
        } else {
            String::new()
        },
        sort: "number".into(),
        ..Default::default()
    });
    view! {
        <section class="page-intro"><div><div class="eyebrow">{if collection{"ВАША ИСТОРИЯ В ЛААРЕ"}else{"МИР ЛААРА · КАРТОЧНАЯ БИБЛИОТЕКА"}}</div><h1>{if collection{"Моя коллекция"}else{"Каждая карта — новая история."}}</h1><p>{if collection{"Собирайте любимых героев. Отмечайте карты и следите за своей коллекцией."}else{"Исследуйте стихии, находите героев и собирайте свою идеальную колоду."}}</p></div><div class="intro-mark" aria-hidden="true">"✧"</div></section>
        <section class="summary-strip"><div><strong>{catalog.cards.iter().filter(|c|c.alt.is_empty()).count()}</strong><span>"карт в энциклопедии"</span></div><div><strong>{catalog.constants.sets.len()}</strong><span>"наборов"</span></div><div><strong>{move||ctx.user.with(UserData::total)}</strong><span>"карт в коллекции"</span></div><div><strong>{move||ctx.user.with(|u|u.decks.len())}</strong><span>"сохранённых колод"</span></div><button class="text-button" on:click=move |_|ctx.new_deck("Новая колода".into(),vec![],vec![],"Констрактед")>"Собрать колоду"<Icon name="arrow"/></button></section>
        <div class="workspace"><FilterPanel filter/><section class="catalog-content">
            <div class="section-heading"><div><span class="eyebrow">{if collection{"ЛИЧНАЯ БИБЛИОТЕКА"}else{"ОТКРОЙТЕ ДЛЯ СЕБЯ"}}</span><h2>{if collection{"Ваши карты"}else{"Все карты"}}</h2></div><button class="button" on:click=move |_|ctx.io.set(Some(IoMode::Collection))><Icon name="save"/>"Импорт .brsc"</button></div>
            <CardBrowser filter mode=if collection{TileMode::Collection}else{TileMode::Catalog}/>
        </section></div>
    }
}
#[component]
pub fn FilterPanel(
    filter: RwSignal<Filter>,
    #[prop(default = false)] deck_scope: bool,
) -> impl IntoView {
    let expanded = RwSignal::new(false);
    let ctx = expect_context::<Ctx>();
    let catalog = ctx.cat();
    let classes: std::collections::BTreeSet<_> = catalog
        .cards
        .iter()
        .flat_map(|c| c.classes.iter().filter(|s| !s.is_empty()).cloned())
        .collect();
    view! {<aside class="filter-panel" class:mobile-collapsed=move||!expanded.get()><div class="filter-heading"><strong><Icon name="filter"/>"Фильтры"</strong><button class="mobile-filter-toggle text-button" aria-expanded=move||expanded.get().to_string() on:click=move |_|expanded.update(|v|*v = !*v)>{move||if expanded.get(){"Свернуть"}else{"Показать"}}</button><button class="text-button" on:click=move |_|filter.set(Filter::default())>"Сбросить"</button></div>
        <label>"Набор"<select prop:value=move||filter.get().set on:change=move|e|filter.update(|f|f.set=event_target_value(&e))><option value="">"Все наборы"</option>{catalog.constants.sets.iter().rev().map(|(k,v)|{let set_id=k.parse().unwrap_or(0);view!{<option value=k.clone() disabled=move || deck_scope && ctx.deck().is_some_and(|d| !set_allowed(d.allowed_sets.as_deref(), set_id))>{v.clone()}</option>}}).collect_view()}</select></label>
        <fieldset><legend>"Стихия"</legend><div class="elements">{[(1,"Степи","☀"),(2,"Горы","△"),(4,"Леса","♧"),(8,"Болота","◉"),(16,"Тьма","☾"),(32,"Нейтралы","◇")].into_iter().map(|(value,label,icon)|view!{<button class="element" class:chosen=move||filter.get().color==value on:click=move |_|filter.update(|f|f.color=if f.color==value{0}else{value})><span class=format!("element-icon color-{value}")>{icon}</span>{label}</button>}).collect_view()}</div></fieldset>
        <label>"Редкость"<select prop:value=move||filter.get().rarity.to_string() on:change=move|e|filter.update(|f|f.rarity=event_target_value(&e).parse().unwrap_or(0))><option value="0">"Любая редкость"</option>{catalog.constants.rarities.iter().map(|(k,v)|view!{<option value=k.clone()>{v.clone()}</option>}).collect_view()}</select></label>
        <fieldset><legend>"Стоимость"</legend><div class="range-inputs"><input type="number" min="0" max="30" placeholder="От" aria-label="Минимальная стоимость" prop:value=move||filter.get().min_cost.map(|n|n.to_string()).unwrap_or_default() on:input=move|e|filter.update(|f|f.min_cost=event_target_value(&e).parse().ok())/><span>"—"</span><input type="number" min="0" max="30" placeholder="До" aria-label="Максимальная стоимость" prop:value=move||filter.get().max_cost.map(|n|n.to_string()).unwrap_or_default() on:input=move|e|filter.update(|f|f.max_cost=event_target_value(&e).parse().ok())/></div></fieldset>
        <label>"В коллекции"<select prop:value=move||filter.get().owned on:change=move|e|filter.update(|f|f.owned=event_target_value(&e))><option value="">"Все карты"</option><option value="owned">"Есть в коллекции"</option><option value="missing">"Ещё нет в коллекции"</option></select></label>
        <label class="check"><input type="checkbox" prop:checked=move||filter.get().favorites on:change=move|e|filter.update(|f|f.favorites=event_target_checked(&e))/><span>"Только избранное"</span><Icon name="star"/></label>
        <label class="check"><input type="checkbox" prop:checked=move||filter.get().standard on:change=move|e|filter.update(|f|f.standard=event_target_checked(&e))/><span>"Без ротированных наборов"</span></label>
        <label>"Издание"<select prop:value=move||filter.get().edition.value() on:change=move|e|filter.update(|f|f.edition=EditionFilter::from_value(&event_target_value(&e)))><option value="all">"Все, включая фойл"</option><option value="base">"Обычные"</option><option value="foil">"Фойловые (все виды)"</option><option value="alternative">"Альтернативные"</option><option value="full-art">"Полноформатные"</option></select></label>
        <details><summary>"Дополнительные параметры"</summary><label>"Тип карты"<select prop:value=move||filter.get().kind on:change=move|e|filter.update(|f|f.kind=event_target_value(&e))><option value="">"Все типы"</option>{catalog.constants.creature_types.iter().map(|(k,v)|view!{<option value=k.clone()>{v.clone()}</option>}).collect_view()}</select></label>
        <label>"Класс"<select prop:value=move||filter.get().class on:change=move|e|filter.update(|f|f.class=event_target_value(&e))><option value="">"Все классы"</option>{classes.into_iter().map(|s|view!{<option value=s.clone()>{s.clone()}</option>}).collect_view()}</select></label>
        <label>"Элитность"<select prop:value=move||filter.get().elite on:change=move|e|filter.update(|f|f.elite=event_target_value(&e))><option value="">"Любая"</option><option value="1">"Элитная"</option><option value="0">"Неэлитная"</option></select></label>
        <label>"Здоровье от"<input type="number" min="0" prop:value=move||filter.get().min_life.map(|n|n.to_string()).unwrap_or_default() on:input=move|e|filter.update(|f|f.min_life=event_target_value(&e).parse().ok())/></label></details>
        <div class="filter-note"><span>"✧"</span><p>"Великие приключения начинаются с одной карты."</p></div>
    </aside>}
}
#[derive(Clone, Copy, PartialEq)]
pub enum TileMode {
    Catalog,
    Collection,
    Deck,
}
#[component]
pub fn CardBrowser(filter: RwSignal<Filter>, mode: TileMode) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let page = RwSignal::new(0usize);
    let list = RwSignal::new(false);
    let ids = Memo::new(move |_| {
        filter.with(|f| {
            ctx.user.with(|u| {
                f.apply(&ctx.cat(), u)
                    .iter()
                    .filter(|c| mode != TileMode::Deck || ctx.deck().is_none_or(|d| d.allows(c)))
                    .map(|c| c.id.clone())
                    .collect::<Vec<_>>()
            })
        })
    });
    Effect::new(move |_| {
        let _ = filter.get();
        page.set(0);
    });
    let current = move || page.get().min(ids.with(|v| v.len().saturating_sub(1) / 40));
    view! {<div class="browser-toolbar"><div class="search-box"><Icon name="search"/><input type="search" aria-label="Поиск карт" placeholder="Название, класс или особенность карты…" prop:value=move||filter.get().query on:input=move|e|filter.update(|f|f.query=event_target_value(&e))/><kbd>"⌕"</kbd></div>
        <select aria-label="Сортировка" prop:value=move||{let s=filter.get().sort;if s.is_empty(){"number".to_string()}else{s}} on:change=move|e|filter.update(|f|f.sort=event_target_value(&e))>{[("number","По номеру"),("name","По имени"),("cost","Стоимость ↑"),("cost_desc","Стоимость ↓"),("rarity","По редкости"),("color","По стихии"),("life","По здоровью"),("rating","Оценка Карапета"),("motd","Рейтинг MotD")].into_iter().map(|(k,v)|view!{<option value=k>{v}</option>}).collect_view()}</select>
        <div class="view-switch"><button aria-label="Сетка" class:active=move||!list.get() on:click=move |_|list.set(false)><Icon/></button><button aria-label="Список" class:active=move||list.get() on:click=move |_|list.set(true)><Icon name="list"/></button></div></div>
        <div class="results-line"><span>{move||format!("Найдено карт: {}",ids.with(Vec::len))}</span><span>"Нажмите на карту, чтобы узнать больше"</span></div>
        <div class="card-grid" class:list-view=move||list.get()><For each=move||ids.with(|v|v.iter().skip(current()*40).take(40).cloned().collect::<Vec<_>>()) key=|id|id.clone() children=move|id|{let card=ctx.cat().get(&id).cloned().expect("Known card");view!{<CardTile card mode/>}}/></div>
        <Show when=move||ids.with(Vec::is_empty)><div class="empty-state"><Icon name="search"/><h3>"Здесь пока нет карт"</h3><p>"Попробуйте изменить фильтры или добавить карты в коллекцию."</p><button class="button" on:click=move |_|filter.set(Filter::default())>"Показать все карты"</button></div></Show>
        <Show when=move||{ids.with(Vec::len)>40}><div class="pagination"><button class="button" disabled=move||current()==0 on:click=move |_|page.set(current().saturating_sub(1))>"← Назад"</button><span>{move||format!("{} / {}",current()+1,ids.with(|v|v.len().div_ceil(40)))}</span><button class="button" disabled=move||{current()+1>=ids.with(|v|v.len().div_ceil(40))} on:click=move |_|page.set(current()+1)>"Далее →"</button></div></Show>
    }
}
// Update only the image surface: pointer movement never rerenders collection state.
fn move_card_tilt(event: web_sys::PointerEvent) {
    let Some(surface) = event
        .current_target()
        .and_then(|t| t.dyn_into::<web_sys::HtmlElement>().ok())
    else {
        return;
    };
    let bounds = surface.get_bounding_client_rect();
    if bounds.width() == 0.0 || bounds.height() == 0.0 {
        return;
    }
    let x = ((f64::from(event.client_x()) - bounds.left()) / bounds.width()).clamp(0.0, 1.0);
    let y = ((f64::from(event.client_y()) - bounds.top()) / bounds.height()).clamp(0.0, 1.0);
    let style = surface.style();
    for (name, value) in [
        ("--card-x", format!("{}%", x * 100.0)),
        ("--card-y", format!("{}%", y * 100.0)),
        ("--card-rx", format!("{}deg", (0.5 - y) * 12.0)),
        ("--card-ry", format!("{}deg", (x - 0.5) * 12.0)),
    ] {
        let _ = style.set_property(name, &value);
    }
}

fn release_card_tilt(event: web_sys::PointerEvent) {
    if event.pointer_type() != "mouse" {
        reset_card_tilt(event);
    }
}

fn reset_card_tilt(event: web_sys::PointerEvent) {
    if let Some(surface) = event
        .current_target()
        .and_then(|t| t.dyn_into::<web_sys::HtmlElement>().ok())
    {
        for name in ["--card-x", "--card-y", "--card-rx", "--card-ry"] {
            let _ = surface.style().remove_property(name);
        }
    }
}

#[component]
pub fn CardTile(card: Card, mode: TileMode) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let c = StoredValue::new(card);
    let cat = ctx.cat();
    let img = cat.image(&c.get_value());
    let finish = crate::foil::Finish::for_card(&c.get_value());
    let is_foil = c.get_value().is_foil();
    view! {<article class="card-tile" class:collection-tile=mode!=TileMode::Deck data-card-id=c.get_value().id><div class="card-art"><div class="card-open" class:foil=c.get_value().is_foil() class:unique-finish=finish.is_some_and(crate::foil::Finish::is_unique) on:pointermove=move_card_tilt on:pointerleave=reset_card_tilt on:pointercancel=reset_card_tilt on:pointerup=release_card_tilt><img src=img alt=c.get_value().name draggable="false" loading="lazy" width="248" height="350"/>{finish.map(|finish|view!{<crate::foil::FoilCanvas finish is_foil/>})}<button class="card-hit-area" aria-label=format!("Открыть {} · {}",c.get_value().name,cat.edition_name(&c.get_value())) on:click=move |_|ctx.detail.set(Some(c.get_value().id))></button></div><button class="favorite" class:chosen=move||ctx.user.with(|u|u.favorites.contains(&c.get_value().id)) aria-label=format!("Избранное: {}",c.get_value().name) on:click=move |_|ctx.favorite(&c.get_value().id)><Icon name="star"/></button>{if !c.get_value().alt.is_empty(){Some(view!{<span class="alt-tag" class:foil-label=c.get_value().is_foil()>{cat.edition_name(&c.get_value())}</span>})}else{None}}</div>
        <div class="card-caption">{c.get_value().uses_base_art().then(||view!{<small class="art-placeholder">"Иллюстрация обычного издания"</small>})}<div class="card-meta"><span class=format!("color-dot color-{}",c.get_value().color)></span><span>{cat.color_name(c.get_value().color)}</span><span class="card-number">{format!("#{:03}",c.get_value().number)}</span></div>{(mode==TileMode::Deck).then(||view!{<button class="card-name" on:click=move |_|ctx.detail.set(Some(c.get_value().id))>{c.get_value().name}</button>})}<div class="card-subline"><span>{cat.rarity_name(c.get_value().rarity)}</span><span class=if c.get_value().elite{"gold-cost"}else{"silver-cost"}>{format!("◆ {}",c.get_value().cost)}</span></div></div>
        <div class="card-actions">{if mode==TileMode::Deck {view!{<button class="add-to-deck" on:click=move |_|ctx.add_card(&c.get_value().id)><Icon name="plus"/>"В колоду"<span>{move||ctx.deck().map(|d|d.cards.iter().filter(|id|**id==c.get_value().id).count()).unwrap_or(0)}</span></button>}.into_any()}else{view!{<span class="owned-label">"В коллекции"</span><div class="stepper"><button aria-label=format!("Убрать {} из коллекции",c.get_value().name) disabled=move||ctx.user.with(|u|u.count(&c.get_value().id))==0 on:click=move |_|ctx.own(&c.get_value().id,-1)>"−"</button><output>{move||ctx.user.with(|u|u.count(&c.get_value().id))}</output><CollectionAddButton card=c.get_value() label=format!("Добавить {} в коллекцию",c.get_value().name)/></div>}.into_any()}}</div>
    </article>}
}
#[component]
fn CollectionAddButton(card: Card, label: String) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let id = StoredValue::new(card.id);
    let rarity = card.rarity.clamp(1, 4);
    let sequence = RwSignal::new(0u64);
    let burst = RwSignal::new(None::<u64>);
    view! {
        <button class=format!("collection-add rarity-{rarity}") aria-label=label on:click=move |_| {
            if ctx.user.with_untracked(|u| u.count(&id.get_value())) == u32::MAX { return; }
            ctx.own(&id.get_value(), 1);
            sequence.update(|n| *n = n.wrapping_add(1));
            // Replace the previous burst so rapid clicks always give immediate feedback.
            burst.set(Some(sequence.get_untracked()));
        }>
            "+"
            <For each=move || { burst.get().into_iter().collect::<Vec<_>>() } key=|n| *n children=move |n| {
                view! {
                    <span class="collection-burst" aria-hidden="true" on:animationend=move |event| {
                        if event.animation_name() == "collection-burst-lifetime" && burst.get_untracked() == Some(n) {
                            burst.set(None);
                        }
                    }>
                        <span class="collection-burst-ring"></span>
                        <span class="collection-burst-badge">"+1"</span>
                        {(rarity >= 3).then(|| (0..if rarity == 4 {12} else {6}).map(|i| {
                            let angle = -165.0 + i as f64 * 150.0 / if rarity == 4 {11.0} else {5.0};
                            let distance = if rarity == 4 {90.0 + (i % 3) as f64 * 17.0} else {66.0};
                            view! {<span class="collection-burst-spark" style=format!("--spark-x:{}px;--spark-y:{}px;--spark-turn:{}deg", angle.to_radians().cos() * distance, angle.to_radians().sin() * distance - 24.0, i * 47)>{if rarity == 4 {"✦"} else {"✧"}}</span>}
                        }).collect_view())}
                    </span>
                }
            }/>
        </button>
    }
}

#[component]
pub fn CardDetail(card: Card) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let cat = ctx.cat();
    let c = StoredValue::new(card);
    let current = c.get_value();
    let finish = crate::foil::Finish::for_card(&current);
    let is_foil = current.is_foil();
    view! {<div class="modal-backdrop" on:click=move |_|ctx.detail.set(None)><section class="modal card-detail" role="dialog" aria-modal="true" aria-label="Описание карты" tabindex="-1" on:click=|e|e.stop_propagation()><button class="modal-close" aria-label="Закрыть описание" autofocus on:click=move |_|ctx.detail.set(None)>"×"</button><div class="detail-image" class:foil=current.is_foil() class:unique-finish=finish.is_some_and(crate::foil::Finish::is_unique) on:pointermove=move_card_tilt on:pointerleave=reset_card_tilt on:pointercancel=reset_card_tilt on:pointerup=release_card_tilt><img draggable="false" src=cat.image(&current) alt=format!("{} · {}",current.name,cat.edition_name(&current))/>{finish.map(|finish|view!{<crate::foil::FoilCanvas finish is_foil/>})}</div><div class="detail-body"><span class="eyebrow">{cat.set_name(current.set_id)}" · "{format!("#{:03}",current.number)}</span><h2>{current.name.clone()}</h2><p class="edition-title" class:foil-label=current.is_foil()>{cat.edition_name(&current)}</p>{current.uses_base_art().then(||view!{<p class="art-placeholder">"Скан этого издания пока недоступен. Показана иллюстрация обычной карты."</p>})}<EditionCollection card=current.clone()/><div class="detail-tags"><span>{cat.color_name(current.color)}</span><span>{cat.rarity_name(current.rarity)}</span><span>{if current.elite{"Элитная"}else{"Неэлитная"}}</span>{current.uniq.then(||view!{<span>"Уникальная"</span>})}</div><p class="muted">{current.classes.join(" · ")}</p>
    <div class="card-stats"><div><b>{current.cost}</b><small>"Стоимость"</small></div><div><b>{current.life.map(|v|v.to_string()).unwrap_or("—".into())}</b><small>"Здоровье"</small></div><div><b>{current.r#move.map(|v|v.to_string()).unwrap_or("—".into())}</b><small>"Движение"</small></div><div><b>{current.hit.as_ref().map(|v|v.iter().map(ToString::to_string).collect::<Vec<_>>().join("–")).unwrap_or("—".into())}</b><small>"Удар"</small></div></div>
    {(current.ban==true).then(||view!{<p class="error">"Это издание карты запрещено в отряде."</p>})}<p class="rules-text">{cat.rules_text(&current)}</p><div class="detail-tags">{current.icons.iter().map(|(k,v)|view!{<span>{format!("{}{}",cat.constants.icons.get(k).unwrap_or(k),if *v>0{format!(" {v}")}else{String::new()})}</span>}).collect_view()}</div><p class="artist">"Художник: "{current.art.clone()}</p>
    <Show when=move || ctx.deck().is_some_and(|d| !d.allows(&c.get_value()))><p class="error">"Набор этой карты не разрешён в выбранной колоде."</p></Show><label>"Добавить в колоду"<select aria-label="Выбор колоды" prop:value=move||ctx.active.get().unwrap_or_default() on:change=move|e|ctx.active.set(Some(event_target_value(&e)))><option value="" disabled>"Выберите колоду"</option>{move||ctx.user.with(|u|u.decks.iter().map(|d|view!{<option value=d.id.clone()>{d.name.clone()}</option>}).collect_view())}</select></label><button class="button primary full" disabled=move || ctx.deck().is_some_and(|d| !d.allows(&c.get_value())) on:click=move |_|{ctx.add_card(&c.get_value().id);}><Icon name="plus"/>{move||if ctx.active.get().is_some(){"Добавить карту"}else{"Создать колоду с этой картой"}}</button>
    <div class="detail-collection"><span>"В вашей коллекции"</span><div class="stepper"><button aria-label="Убрать экземпляр" on:click=move |_|ctx.own(&c.get_value().id,-1)>"−"</button><output>{move||ctx.user.with(|u|u.count(&c.get_value().id))}</output><CollectionAddButton card=c.get_value() label="Добавить экземпляр".to_string()/></div></div>
    <details><summary>"Тиражи, цены и оценки"</summary><p>{if cat.ratings.contains_key(&current.set_id.to_string()) {format!("Карапет: {:.1} · MotD: {}",cat.rating(&current),cat.rank(&current)+1)} else {"Оценки для этого набора пока не добавлены".into()}}</p>{current.prints.iter().map(|(k,v)|view!{<p>{format!("{k}: {v}")}</p>}).collect_view()}<CollectionMetadata card=current.clone()/></details>
    </div></section></div>}
}
#[component]
fn EditionCollection(card: Card) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let cat = ctx.cat();
    let editions = std::iter::once(String::new())
        .chain(card.alts.clone())
        .filter_map(|alt| cat.get(&format!("{}{}", card.base_id, alt)).cloned())
        .collect::<Vec<_>>();
    view! {
        <section class="edition-collection" aria-label="Издания в коллекции">
            <h3>"Издания в коллекции"</h3>
            <p class="muted">"Количество каждого издания учитывается отдельно."</p>
            <div class="edition-rows">{editions.into_iter().map(|edition|{
                let selected = edition.id == card.id;
                let foil = edition.is_foil();
                let label = cat.edition_name(&edition);
                let id = StoredValue::new(edition.id);
                view!{<div class="edition-row" class:selected>
                    <button class="edition-link" class:foil-label=foil aria-pressed=selected.to_string() on:click=move |_|ctx.detail.set(Some(id.get_value()))>{label.clone()}</button>
                    <input type="number" min="0" max=u32::MAX step="1" aria-label=format!("Количество: {label}") prop:value=move||ctx.user.with(|u|u.count(&id.get_value())).to_string() on:input=move|ev|{
                        match event_target_value(&ev).parse::<u32>() {
                            Ok(n)=>ctx.change(|u|u.set_count(&id.get_value(),n)),
                            Err(_)=>{event_target::<web_sys::HtmlInputElement>(&ev).set_value(&ctx.user.with_untracked(|u|u.count(&id.get_value())).to_string());ctx.toast.set("Количество должно быть целым числом от 0".into());}
                        }
                    }/>
                </div>}
            }).collect_view()}</div>
        </section>
    }
}
#[component]
fn CollectionMetadata(card: Card) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let id = StoredValue::new(card.id);
    view! {<div class="collection-metadata">{move||{
        let entry=ctx.user.with(|u|u.collection.get(&id.get_value()).cloned()).unwrap_or_default();
        let keys=entry.count.keys().chain(entry.costs.keys()).cloned().collect::<std::collections::BTreeSet<_>>();
        let cat=ctx.cat();
        view!{<table><caption>"Данные коллекции из .brsc"</caption><thead><tr><th>"Тираж / отметка"</th><th>"Кол-во"</th><th>"Цена, ₽"</th></tr></thead><tbody>{keys.into_iter().map(|key|view!{<tr><th>{cat.constants.alternatives.get(&key).cloned().unwrap_or(key.clone())}</th><td>{entry.count.get(&key).map(ToString::to_string).unwrap_or("—".into())}</td><td>{entry.costs.get(&key).map(ToString::to_string).unwrap_or("—".into())}</td></tr>}).collect_view()}</tbody></table>}
    }}</div>}
}
#[component]
fn TransferDialog(mode: IoMode) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let input = RwSignal::new(String::new());
    let error = RwSignal::new(String::new());
    let merge = RwSignal::new(true);
    let reading = RwSignal::new(false);
    let import_summary = Memo::new(move |_| {
        if mode != IoMode::Collection {
            return None;
        }
        formats::read_collection(&input.get(), &ctx.cat())
            .ok()
            .map(|collection| {
                let user = UserData {
                    collection,
                    ..Default::default()
                };
                let foil_count: u64 = user
                    .collection
                    .iter()
                    .filter(|(id, _)| ctx.cat().get(id).is_some_and(Card::is_foil))
                    .map(|(_, e)| u64::from(*e.count.get("").unwrap_or(&0)))
                    .sum();
                format!(
                    "В файле: {} карт, из них фойловых: {}. Записей: {}.",
                    user.total(),
                    foil_count,
                    user.collection.len()
                )
            })
    });
    let title = match mode {
        IoMode::Backup => "Мои данные",
        IoMode::Collection => "Перенос коллекции",
        IoMode::Deck => "Перенос колоды",
    };
    let do_import = move |_| {
        let text = input.get_untracked();
        let cat = ctx.cat();
        let result = (|| -> Result<(), String> {
            if text.trim().is_empty() {
                return Err("Выберите файл или вставьте текст".into());
            }
            if text.len() > 10_000_000 {
                return Err("Файл превышает 10 МБ".into());
            }
            match mode {
                IoMode::Backup => {
                    let user: UserData =
                        serde_json::from_str(&text).map_err(|e| format!("Неверный JSON: {e}"))?;
                    user.validate(&cat)?;
                    if !window()
                        .confirm_with_message(
                            "Заменить текущие колоды и коллекцию данными из резервной копии?",
                        )
                        .unwrap_or(false)
                    {
                        return Ok(());
                    }
                    let active = user.decks.first().map(|d| d.id.clone());
                    ctx.change(|u| *u = user);
                    ctx.active.set(active);
                    ctx.storage_ok.set(true);
                }
                IoMode::Collection => {
                    let collection = formats::read_collection(&text, &cat)?;
                    if merge.get_untracked() {
                        let mut next = ctx.user.get_untracked().collection;
                        for (id, e) in collection {
                            let entry = next.entry(id).or_default();
                            for (k, v) in e.count {
                                let count = entry.count.entry(k).or_default();
                                *count = count.checked_add(v).ok_or("Количество слишком велико")?;
                            }
                            entry.costs.extend(e.costs);
                        }
                        ctx.change(|u| u.collection = next);
                    } else {
                        if !window()
                            .confirm_with_message("Заменить текущую коллекцию содержимым файла?")
                            .unwrap_or(false)
                        {
                            return Ok(());
                        }
                        ctx.change(|u| u.collection = collection);
                    }
                }
                IoMode::Deck => {
                    let t = text.trim();
                    let deck = if t.starts_with('{') {
                        formats::read_tts(t, &cat, new_id())?
                    } else if t.starts_with('#') && !t.contains(char::is_whitespace) {
                        formats::read_compact(t, &cat, new_id())?
                    } else {
                        formats::read_deck(t, &cat, new_id())?
                    };
                    let id = deck.id.clone();
                    ctx.change(|u| u.decks.insert(0, deck));
                    ctx.active.set(Some(id));
                    ctx.navigate(Page::Decks);
                }
            }
            if mode == IoMode::Collection {
                ctx.navigate(Page::Collection);
            }
            ctx.toast.set("Данные импортированы".into());
            ctx.io.set(None);
            Ok(())
        })();
        if let Err(e) = result {
            error.set(e);
        }
    };
    view! {<div class="modal-backdrop" on:click=move |_|ctx.io.set(None)><section class="modal transfer-modal" role="dialog" aria-modal="true" aria-label=title on:click=|e|e.stop_propagation()><button class="modal-close" autofocus aria-label="Закрыть" on:click=move |_|ctx.io.set(None)>"×"</button><span class="eyebrow">"ВСЕГДА ПОД РУКОЙ"</span><h2>{title}</h2><p class="muted">{match mode{IoMode::Backup=>if crate::desktop::available(){"Коллекция, избранное и колоды сохраняются в Berserk. Резервная копия позволяет перенести их на другое устройство."}else{"Коллекция, избранное и колоды сохраняются в этом браузере. Резервная копия позволяет перенести их на другое устройство."},IoMode::Collection=>"Выберите .brsc из berserk-nxt. Обычные, фойловые и альтернативные карты учитываются отдельно; тиражи и цены сохраняются. Также можно вставить текст файла.",IoMode::Deck=>"Импортируйте текстовый деклист по именам или ID, включая ---side---, компактный код оригинального приложения или JSON Tabletop Simulator."}}</p>
        <div class="export-actions">{match mode{
            IoMode::Backup=>view!{<button class="button primary" on:click=move |_|save_file(ctx,"berserk-backup.json",serde_json::to_string_pretty(&ctx.user.get_untracked()).unwrap_or_default(),"application/json")><Icon name="save"/>"Скачать резервную копию"</button><button class="button" on:click=move |_|ctx.io.set(Some(IoMode::Collection))>"Импорт коллекции .brsc"</button>}.into_any(),
            IoMode::Collection=>view!{<button class="button primary" on:click=move |_|save_file(ctx,"collection.brsc",formats::write_collection(&ctx.user.get_untracked().collection),"text/plain;charset=utf-8")>"Скачать .brsc"</button><button class="button" on:click=move |_|save_file(ctx,"collection.csv",formats::collection_csv(&ctx.user.get_untracked(),&ctx.cat()),"text/csv;charset=utf-8")>"Экспорт CSV"</button>}.into_any(),
            IoMode::Deck=>view!{<Show when=move||ctx.deck().is_some()><button class="button primary" on:click=move |_|{if let Some(d)=ctx.deck_untracked(){save_file(ctx,"deck.txt",formats::write_deck(&d,&ctx.cat(),true),"text/plain;charset=utf-8");}}>"Деклист .txt"</button><button class="button" on:click=move |_|{if let Some(d)=ctx.deck_untracked(){save_file(ctx,"deck.brsd",formats::write_deck(&d,&ctx.cat(),false),"text/plain;charset=utf-8");}}>"По ID .brsd"</button><button class="button" on:click=move |_|{if let Some(d)=ctx.deck_untracked(){input.set(formats::write_compact(&d,&ctx.cat()));}}>"Компактный код"</button><button class="button" on:click=move |_|{if let Some(d)=ctx.deck_untracked(){match formats::write_tts(&d,&ctx.cat()){Ok(text)=>save_file(ctx,"deck-tts.json",text,"application/json"),Err(e)=>error.set(e)}}}>"Tabletop Simulator"</button></Show>}.into_any(),
        }}</div><hr/><h3>"Импорт"</h3><label class="file-drop">"Выбрать файл"<input type="file" accept=match mode{IoMode::Collection=>".brsc,.brs,.txt",IoMode::Deck=>".brsd,.brs,.txt,.json",IoMode::Backup=>".json"} on:change=move|ev|{let element=event_target::<web_sys::HtmlInputElement>(&ev);if let Some(file)=element.files().and_then(|f|f.get(0)){
            if file.size()>10_000_000.0{error.set("Файл превышает 10 МБ".into());return;}
            reading.set(true);
            leptos::task::spawn_local(async move{match wasm_bindgen_futures::JsFuture::from(file.text()).await{Ok(v)=>{input.set(v.as_string().unwrap_or_default());error.set(String::new());},Err(_)=>error.set("Не удалось прочитать файл".into())}reading.set(false);});
        }}/></label><textarea rows="7" aria-label="Данные для импорта" placeholder="Или вставьте содержимое файла сюда…" prop:value=move||input.get() on:input=move|e|input.set(event_target_value(&e))></textarea>
        {(mode==IoMode::Collection).then(||view!{<label class="check"><input type="checkbox" prop:checked=move||merge.get() on:change=move|e|merge.set(event_target_checked(&e))/><span>"Добавить к текущей коллекции (снять для замены)"</span></label>})}
        <Show when=move||reading.get()><p role="status">"Чтение файла…"</p></Show>{move||import_summary.get().map(|summary|view!{<p class="import-summary" role="status">{summary}</p>})}
        <Show when=move||!error.get().is_empty()><p class="error" role="alert">{move||error.get()}</p></Show><div class="dialog-actions"><button class="button" on:click=move |_|ctx.io.set(None)>"Закрыть"</button><button class="button primary" disabled=move||reading.get() on:click=do_import>"Импортировать"</button></div>
    </section></div>}
}

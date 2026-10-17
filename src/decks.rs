use crate::app::*;
use crate::deck_text_ui::DeckText;
use berserk_leptos::{model::*, shuffle::Rng};
use leptos::prelude::*;
use std::collections::BTreeSet;
use wasm_bindgen::JsCast;

#[component]
pub fn DecksPage() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let has_deck = Memo::new(move |_| ctx.deck().is_some());
    view! {<section class="page-intro compact"><div><span class="eyebrow">"ОТ ИДЕИ ДО ПЕРВОЙ ПОБЕДЫ"</span><h1>"Мои колоды"</h1><p>"Собирайте, пробуйте и находите своё сочетание стихий."</p></div><div class="intro-actions"><button class="button" on:click=move |_|ctx.io.set(Some(IoMode::Deck))>"Импорт колоды"</button><button class="button primary" on:click=move |_|ctx.new_deck("Новая колода".into(),vec![],vec![],"Констрактед")><Icon name="plus"/>"Новая колода"</button></div></section>
        <CodexDeckBuilder/>
        {move||if has_deck.get(){view!{<DeckEditor/>}.into_any()}else{view!{<DeckLibrary/>}.into_any()}}
    }
}
#[component]
fn DeckLibrary() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let search = RwSignal::new(String::new());
    view! {<section class="deck-library"><div class="search-box"><Icon name="search"/><input type="search" aria-label="Поиск колод" placeholder="Найти колоду…" on:input=move|e|search.set(event_target_value(&e))/></div><div class="deck-grid"><For each=move||ctx.user.with(|u|u.decks.iter().filter(|d|normalize(&d.name).contains(&normalize(&search.get()))).cloned().collect::<Vec<_>>()) key=|d|d.id.clone() children=move|deck|{let d=StoredValue::new(deck);let cat=ctx.cat();view!{
        <article class="deck-cover"><button class="deck-cover-image" on:click=move |_|ctx.active.set(Some(d.get_value().id))>{if let Some(c)=d.get_value().cards.first().and_then(|id|cat.get(id)).or_else(||d.get_value().side.first().and_then(|id|cat.get(id))){view!{<img src=cat.image(c) alt="" loading="lazy"/>}.into_any()}else{view!{<span>"✧"</span>}.into_any()}}<span>{d.get_value().tags.join(" · ")}</span></button><div class="deck-cover-body"><button class="card-name" on:click=move |_|ctx.active.set(Some(d.get_value().id))>{d.get_value().name}</button><p>{format!("{} карт · {} в запасе",d.get_value().cards.len(),d.get_value().side.len())}</p><div class="deck-cover-actions"><button class="text-button" on:click=move |_|ctx.active.set(Some(d.get_value().id))>"Редактировать →"</button><button class="text-button danger" on:click=move |_|{let d=d.get_value();if window().confirm_with_message(&format!("Удалить колоду «{}»?",d.name)).unwrap_or(false){ctx.change(|u|u.decks.retain(|x|x.id!=d.id));}}>"Удалить"</button></div></div></article>
    } }/></div><Show when=move||ctx.user.with(|u|u.decks.is_empty())><div class="empty-state"><span class="empty-symbol">"◇"</span><h2>"Ваша первая колода ждёт"</h2><p>"Выберите карты в энциклопедии или импортируйте готовый деклист."</p><button class="button primary" on:click=move |_|ctx.new_deck("Новая колода".into(),vec![],vec![],"Констрактед")>"Создать колоду"</button></div></Show></section>}
}
#[component]
fn DeckEditor() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let filter = RwSignal::new(Filter::default());
    let deal = RwSignal::new(false);
    view! {<section class="deck-editor"><div class="editor-heading"><button class="text-button" on:click=move |_|ctx.active.set(None)>"← Все колоды"</button><input class="deck-title-input" aria-label="Название колоды" prop:value=move||ctx.deck().map(|d|d.name).unwrap_or_default() on:input=move|e|{let name=event_target_value(&e);ctx.edit_deck(|d|d.name=if name.trim().is_empty(){"Без названия".into()}else{name});}/><div class="editor-actions"><button class="button" on:click=move |_|{ctx.copy_deck();}>"Копия"</button><button class="button" on:click=move |_|ctx.io.set(Some(IoMode::Deck))>"Экспорт"</button><button class="button" on:click=move |_|{let _=window().print();}>"Печать"</button><button class="button primary" disabled=move||ctx.deck().is_none_or(|d|d.cards.is_empty()) on:click=move |_|deal.update(|v|*v = !*v)>{move||if deal.get(){"К редактору"}else{"Пробная раздача"}}</button></div></div>
        <DeckAllowedSets/>
        <DeckNotes/>
        <DeckFeedback/>
        {move||if deal.get(){view!{<DealSimulator/>}.into_any()}else{view!{<div class="builder-layout"><section class="builder-catalog"><details class="builder-filters"><summary>"Фильтры карт"</summary><FilterPanel filter deck_scope=true/></details><CardBrowser filter mode=TileMode::Deck/></section><DeckPanel/></div>}.into_any()}}
        {move||ctx.deck().map(|deck|view!{<PrintDeck deck/>})}
    </section>}
}
#[component]
fn DeckPanel() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    view! {<aside class="deck-panel"><div class="deck-panel-title"><h2>"Состав колоды"</h2><button class="text-button" disabled=move||ctx.undo.with(Vec::is_empty) on:click=move |_|{let mut old=None;ctx.undo.update(|v|old=v.pop());if let Some(old)=old{ctx.user.set(old);if ctx.deck_untracked().is_none(){ctx.active.set(ctx.user.with_untracked(|u|u.decks.first().map(|d|d.id.clone())));}}}>"Отменить"</button></div><div class="tabs"><button class:active=move||!ctx.side.get() on:click=move |_|ctx.side.set(false)>{move||format!("Колода · {}",ctx.deck().map(|d|d.cards.len()).unwrap_or(0))}</button><button class:active=move||ctx.side.get() on:click=move |_|ctx.side.set(true)>{move||format!("Запас · {}",ctx.deck().map(|d|d.side.len()).unwrap_or(0))}</button></div><p class="panel-hint">{move||if ctx.side.get(){"Новые карты добавляются в запас"}else{"Новые карты добавляются в основную колоду"}}</p>
        <div class="deck-rows">{move||ctx.deck().map(|d|{let ids=if ctx.side.get(){d.side}else{d.cards};let cat=ctx.cat();grouped(&ids).into_iter().filter_map(|(id,n)|{let card=cat.get(&id)?.clone();Some(view!{<DeckRow card count=n/>})}).collect_view()})}</div>
        <Show when=move||ctx.deck().is_some_and(|d|if ctx.side.get(){d.side.is_empty()}else{d.cards.is_empty()})><div class="panel-empty">"Нажмите «В колоду» под картой, чтобы добавить её сюда."</div></Show>
        {move||ctx.deck().map(|d|view!{<DeckStats ids=d.cards/>})}
    </aside>}
}
#[component]
fn DeckRow(card: Card, count: usize) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let c = StoredValue::new(card);
    let cat = ctx.cat();
    view! {<div class="deck-row"><button class="deck-row-card" on:click=move |_|ctx.detail.set(Some(c.get_value().id))><img src=cat.image(&c.get_value()) alt="" loading="lazy"/><span><strong>{c.get_value().name}</strong><small>{format!("◆ {} · {}",c.get_value().cost,cat.color_name(c.get_value().color))}</small></span></button><div class="stepper"><button aria-label=format!("Убрать {} из колоды",c.get_value().name) on:click=move |_|ctx.edit_deck(|d|d.remove(&c.get_value().id,ctx.side.get_untracked()))>"−"</button><output>{count}</output><button aria-label=format!("Добавить {} в колоду",c.get_value().name) on:click=move |_|ctx.add_card(&c.get_value().id)>"+"</button></div><button class="move-card" title="Переместить между колодой и запасом" aria-label=format!("Переместить {}",c.get_value().name) on:click=move |_|{let side=ctx.side.get_untracked();ctx.edit_deck(|d|{d.remove(&c.get_value().id,side);d.add(&c.get_value().id,!side);});}>"⇄"</button></div>}
}
#[component]
pub fn DeckStats(ids: Vec<String>) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let cat = ctx.cat();
    let stats = Stats::of(&ids, &cat);
    let high_total: usize = stats
        .curve
        .iter()
        .filter(|(c, _)| **c >= 12)
        .map(|(_, n)| *n)
        .sum();
    let max = stats
        .curve
        .values()
        .copied()
        .max()
        .unwrap_or(1)
        .max(high_total);
    view! {<section class="deck-stats"><div class="stats-totals"><div><b>{stats.total}</b><span>"карт"</span></div><div><b class="gold-cost">{stats.gold}</b><span>"золото"</span></div><div><b>{stats.silver}</b><span>"серебро"</span></div></div><h3>"Кривая стоимости"</h3><div class="cost-chart" role="img" aria-label="Количество карт по стоимости">{(1..=12).map(|cost|{let n=if cost==12{stats.curve.iter().filter(|(k,_)|**k>=12).map(|(_,v)|*v).sum()}else{*stats.curve.get(&cost).unwrap_or(&0)};view!{<div class="cost-column" title=format!("Стоимость {cost}: {n}")><span>{if n>0{n.to_string()}else{String::new()}}</span><i style:height=format!("{}px",n*60/max)></i><small>{if cost==12{"12+".into()}else{cost.to_string()}}</small></div>}}).collect_view()}</div><div class="color-breakdown">{stats.colors.iter().map(|(&color,&n)|view!{<span><i class=format!("color-dot color-{color}")></i>{cat.color_name(color)}<b>{n}</b></span>}).collect_view()}</div></section>}
}
#[component]
fn DealSimulator() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let hand = RwSignal::new(Vec::<String>::new());
    let selected = RwSignal::new(BTreeSet::<usize>::new());
    let mulligans = RwSignal::new(0u32);
    let second = RwSignal::new(false);
    let draw = move || {
        let mut ids = ctx.deck_untracked().map(|d| d.cards).unwrap_or_default();
        Rng::new(seed()).shuffle(&mut ids);
        ids.truncate(15);
        hand.set(ids);
        selected.set(BTreeSet::new());
    };
    draw();
    let squad = Memo::new(move |_| {
        hand.with(|h| {
            selected.with(|s| {
                s.iter()
                    .filter_map(|&i| h.get(i).cloned())
                    .collect::<Vec<_>>()
            })
        })
    });
    view! {<section class="deal-simulator"><div class="section-heading"><div><span class="eyebrow">"ПРОВЕРЬТЕ СВОЮ СТРАТЕГИЮ"</span><h2>"Пробная раздача"</h2><p class="muted">"Выберите из руки карты для отряда. Повторное нажатие возвращает карту в руку."</p></div><div class="intro-actions"><button class="button" on:click=move |_|{mulligans.set(0);draw();}>"Новая раздача"</button><button class="button" on:click=move |_|{mulligans.update(|n|*n=n.saturating_add(1));draw();}>"Пересдать (−1 золото)"</button></div></div>
        <div class="squad-toolbar"><label class="check"><input type="checkbox" prop:checked=move||second.get() on:change=move|e|second.set(event_target_checked(&e))/><span>"Хожу вторым"</span></label><span>{move||format!("Пересдач: {}",mulligans.get())}</span><strong>{move||{let(g,s)=squad_budget(&squad.get(),&ctx.cat(),second.get(),mulligans.get());format!("Осталось: {g} золота · {s} серебра")}}</strong><span>{move||format!("В отряде: {}",selected.with(BTreeSet::len))}</span></div>
        {move||{let mut issues=squad_issues(&squad.get(),&ctx.cat());let(g,s)=squad_budget(&squad.get(),&ctx.cat(),second.get(),mulligans.get());if g<0||s<0{issues.push("Не хватает кристаллов для этого отряда".into());}issues.into_iter().map(|s|view!{<p class="error">{s}</p>}).collect_view()}}
        <div class="hand-grid">{move||hand.get().into_iter().enumerate().filter_map(|(i,id)|ctx.cat().get(&id).cloned().map(|c|{let image=ctx.cat().image(&c);view!{<div class="hand-card" class:selected=move||selected.with(|s|s.contains(&i))><button on:click=move |_|selected.update(|s|{if !s.remove(&i){s.insert(i);}})><img src=image alt=c.name.clone()/><span>{move||if selected.with(|s|s.contains(&i)){"✓ В отряде"}else{"Добавить в отряд"}}</span></button><button class="text-button" on:click=move |_|ctx.detail.set(Some(id.clone()))>{c.name}</button></div>}})).collect_view()}</div>
    </section>}
}

#[component]
fn PrintDeck(deck: Deck) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let cat = ctx.cat();
    let sets = deck
        .allowed_sets
        .as_ref()
        .map(|sets| {
            sets.iter()
                .map(|id| cat.set_name(*id))
                .collect::<Vec<_>>()
                .join(" · ")
        })
        .unwrap_or_else(|| "Все наборы".into());
    view! {<section class="print-only"><h1>{deck.name.clone()}</h1><p>{deck.tags.join(" · ")}</p><p>"Разрешённые наборы: "{sets}</p><DeckText text=deck.description/><h2>"Как играть"</h2><DeckText text=deck.how_to_play/><h2>"Улучшения"</h2><DeckText text=deck.improvements/>{[("Колода",deck.cards),("Запас",deck.side)].into_iter().map(|(title,ids)|view!{<h2>{format!("{title} — {} карт",ids.len())}</h2><table><thead><tr><th>"Количество"</th><th>"Карта"</th><th>"Набор / №"</th><th>"Стоимость"</th></tr></thead><tbody>{grouped(&ids).into_iter().filter_map(|(id,n)|{let c=cat.get(&id)?;Some(view!{<tr><td>{n}</td><td>{c.name.clone()}</td><td>{format!("{} / {}",cat.set_name(c.set_id),c.number)}</td><td>{format!("{} {}",c.cost,if c.elite{"золото"}else{"серебро"})}</td></tr>})}).collect_view()}</tbody></table>}).collect_view()}</section>}
}

#[component]
fn DeckNotes() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let editing = RwSignal::new(false);
    view! {<details class="deck-notes" open>
        <summary>"Описание и план игры"</summary>
        <div class="deck-notes-toolbar"><button class="button" aria-pressed=move || editing.get().to_string() on:click=move |_| editing.update(|v| *v = !*v)>{move || if editing.get() {"Готово"} else {"Редактировать текст"}}</button>
            <span class="muted">"Нажмите на имя карты, чтобы открыть описание."</span>
        </div>
        <Show when=move || editing.get()><p class="muted deck-markdown-help">"Markdown: "<code>"[card:80001]"</code>" — ссылка на карту; "<code>"**важное**"</code>" — выделение; "<code>"## Заголовок"</code>" и "<code>"- пункт"</code>" — структура текста. Изменения сохраняются автоматически; ниже виден результат."</p></Show>
        <div class="deck-notes-grid">
            <section class="deck-note-field"><h3>"Описание"</h3>
                <Show when=move || editing.get()><textarea aria-label="Описание" rows="5" maxlength="4000" placeholder="Идея колоды, ключевые карты и синергии…"
                    prop:value=move || ctx.deck().map(|d| d.description).unwrap_or_default()
                    on:input=move |e| ctx.edit_deck(|d| d.description = event_target_value(&e))/></Show>
                {move || view!{<DeckText text=ctx.deck().map(|d| d.description).unwrap_or_default()/>}}
            </section>
            <section class="deck-note-field"><h3>"Как играть"</h3>
                <Show when=move || editing.get()><textarea aria-label="Как играть" rows="5" maxlength="8000" placeholder="Стартовая рука, набор отряда, расстановка и первые ходы…"
                    prop:value=move || ctx.deck().map(|d| d.how_to_play).unwrap_or_default()
                    on:input=move |e| ctx.edit_deck(|d| d.how_to_play = event_target_value(&e))/></Show>
                {move || view!{<DeckText text=ctx.deck().map(|d| d.how_to_play).unwrap_or_default()/>}}
            </section>
            <section class="deck-note-field deck-improvements"><h3>"Улучшения"</h3><p class="muted">"Какие карты вне коллекции стоит добавить, что заменить и почему."</p>
                <Show when=move || editing.get()><textarea aria-label="Улучшения" rows="5" maxlength="8000" placeholder="Приоритетные приобретения, замены и ожидаемый эффект…"
                    prop:value=move || ctx.deck().map(|d| d.improvements).unwrap_or_default()
                    on:input=move |e| ctx.edit_deck(|d| d.improvements = event_target_value(&e))/></Show>
                {move || view!{<DeckText text=ctx.deck().map(|d| d.improvements).unwrap_or_default()/>}}
            </section>
        </div>
    </details>}
}

#[component]
fn DeckFeedback() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let feedback = RwSignal::new(String::new());
    let restart = RwSignal::new(false);
    let submitted = RwSignal::new(None::<(String, String)>);
    let active = Memo::new(move |_| ctx.active.get());
    Effect::new(move |_| {
        let _ = active.get();
        feedback.set(String::new());
        restart.set(false);
        submitted.set(None);
    });
    Effect::new(move |_| {
        let progress = ctx.build_progress.get();
        if let Some((id, text)) = submitted.get_untracked()
            && progress.request_id == id
            && progress.phase == "succeeded"
        {
            if feedback.get_untracked() == text {
                feedback.set(String::new());
            }
            restart.set(false);
            submitted.set(None);
        }
    });
    let own_progress = move || {
        ctx.build_progress
            .with(|p| p.deck_id == ctx.active.get() && p.deck_id.is_some())
    };
    view! {<details class="codex-builder deck-feedback" open=own_progress>
        <summary>"✧ Обсудить колоду с Codex"</summary>
        <p>{move || if ctx.deck().is_some_and(|d| d.agent_session.is_some()) {
            "Продолжите обсуждение: Codex учтёт ваши пожелания и обновит эту колоду."
        } else {"Напишите пожелания: Codex начнёт обсуждение текущей колоды и поможет её доработать."}}</p>
        <p class="muted">"Только карты вашей коллекции и разрешённых наборов. Запас сохраняется. Перед обновлением Codex проверит несколько пробных раздач. Изменения можно отменить в редакторе."</p>
        <label class="deck-feedback-label">"Ваши пожелания"<textarea rows="3" maxlength="2000" aria-label="Пожелания по колоде" placeholder="Например: часто не хватает бойцов первого ряда. Сделай отряд устойчивее при игре вторым."
            prop:value=move || feedback.get() on:input=move |e| feedback.set(event_target_value(&e))/></label>
        <Show when=move || ctx.deck().is_some_and(|d| d.agent_session.is_some())>
            <label class="deck-feedback-restart"><input type="checkbox" prop:checked=move || restart.get() on:change=move |e| restart.set(event_target_checked(&e))/><span>"Начать новое обсуждение этой колоды"</span></label>
        </Show>
        <div class="intro-actions"><button class="button primary" disabled=move || feedback.with(|s| s.trim().is_empty() || s.len()>8000) || !ctx.agent_connected.get() || !ctx.storage_ok.get() || ctx.build_progress.with(|p|p.busy())
            on:click=move |_| {
                if let Some(deck) = ctx.deck_untracked() {
                    let request_id = new_id();
                    let text = feedback.get_untracked();
                    submitted.set(Some((request_id.clone(),text.clone())));
                    ctx.build_progress.set(berserk_leptos::agent::BuildProgress { request_id:request_id.clone(), phase:"queued".into(), message:"Отправляю пожелания…".into(), deck_id:Some(deck.id.clone()) });
                    ctx.build_event.set(Some(berserk_leptos::agent::BuildEvent::RefineDeck {request_id, expected_revision:berserk_leptos::agent::revision(&deck), deck_id:deck.id, feedback:text, restart_session:restart.get_untracked()}));
                }
            }>"Отправить пожелания"</button>
            <Show when=move || own_progress() && ctx.build_progress.with(|p|p.busy() && p.phase!="saving")>
                <button class="button" on:click=move |_| ctx.build_event.set(Some(berserk_leptos::agent::BuildEvent::CancelBuild {request_id:ctx.build_progress.get_untracked().request_id}))>"Отменить"</button>
            </Show>
        </div>
        <Show when=move || !ctx.agent_connected.get()><p class="muted">"Для отправки пожеланий подключите локальный сервис Codex."</p></Show>
        <Show when=own_progress><p role="status" class:error=move || ctx.build_progress.with(|p|p.phase=="failed")>{move || ctx.build_progress.get().message}</p></Show>
        {move || ctx.deck().and_then(|d| d.agent_session).filter(|s| !s.feedback.is_empty()).map(|session| view! {
            <details class="deck-feedback-history"><summary>"Предыдущие пожелания"</summary><ol>{session.feedback.into_iter().map(|text| view!{<li>{text}</li>}).collect_view()}</ol></details>
        })}
    </details>}
}

#[component]
fn CodexDeckBuilder() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let size = RwSignal::new(30u16);
    let preferences = RwSignal::new(String::new());
    let allowed_sets = RwSignal::new(ctx.default_allowed_sets.get_untracked());
    Effect::new(move |_| allowed_sets.set(ctx.default_allowed_sets.get()));
    let message = RwSignal::new(String::new());
    let prompt = Memo::new(move |_| {
        berserk_leptos::deck_prompt::deck_build_prompt(
            size.get(),
            &preferences.get(),
            Some(&allowed_sets.get()),
        )
    });
    view! {<details class="codex-builder" open=move || ctx.build_progress.with(|p| p.deck_id.is_none() && !p.phase.is_empty())>
        <summary>"✧ Создать колоду с Codex AI"</summary>
        <p>"Codex подберёт карты из вашей коллекции, создаст описание и план игры и сохранит колоду прямо здесь. Для создания используется ваш аккаунт Codex."</p>
        <p class="muted">{move || format!("Карт в коллекции: {}. Учитываются обычные, фойловые и альтернативные издания.", ctx.user.with(UserData::total))}</p>
        <AllowedSetsPicker selected=allowed_sets/>
        <div class="codex-builder-fields">
            <label>"Карт в колоде"<input type="number" min="30" max="50" prop:value=move || size.get()
                on:input=move |e| size.set(event_target_value(&e).parse().unwrap_or(0))/></label>
            <label>"Пожелания"<textarea rows="3" maxlength="2000" placeholder="Например: лес и болота, устойчивый отряд, простая стратегия для новичка"
                prop:value=move || preferences.get() on:input=move |e| preferences.set(event_target_value(&e))/></label>
        </div>
        <p class="muted">"Только карты из коллекции. Если карт недостаточно, Codex объяснит, чего не хватает."</p>
        <div class="intro-actions">
            <button class="button primary" disabled=move || prompt.get().is_err() || ctx.user.with(UserData::total)==0 || !ctx.agent_connected.get() || !ctx.storage_ok.get() || ctx.build_progress.with(|p|p.busy()) on:click=move |_| {
                let request_id = new_id();
                ctx.build_progress.set(berserk_leptos::agent::BuildProgress {request_id:request_id.clone(),phase:"queued".into(),message:"Запускаю Codex…".into(),deck_id:None});
                ctx.build_event.set(Some(berserk_leptos::agent::BuildEvent::BuildDeck {request_id,size:size.get_untracked(),preferences:preferences.get_untracked(),allowed_sets:Some(allowed_sets.get_untracked())}));
            }>{move || if ctx.build_progress.with(|p|p.busy()) {"Codex работает…"} else {"Создать колоду"}}</button>
            <Show when=move || ctx.build_progress.with(|p|p.busy() && p.phase!="saving")>
                <button class="button" on:click=move |_| ctx.build_event.set(Some(berserk_leptos::agent::BuildEvent::CancelBuild {request_id:ctx.build_progress.get_untracked().request_id}))>"Отменить создание"</button>
            </Show>
            <Show when=|| !crate::desktop::available()><button class="button" disabled=move || prompt.get().is_err() || ctx.user.with(UserData::total)==0 on:click=move |_| {
                if let Ok(text) = prompt.get_untracked() {
                    wasm_bindgen_futures::spawn_local(async move {
                        let result = wasm_bindgen_futures::JsFuture::from(window().navigator().clipboard().write_text(&text)).await;
                        message.set(if result.is_ok() {"Запрос скопирован. Вставьте его в Codex с подключённым Berserk MCP."} else {"Не удалось скопировать. Выделите и скопируйте запрос ниже вручную."}.into());
                    });
                }
            }>"Скопировать запрос для Codex"</button></Show>
            <Show when=crate::desktop::available><button class="button" on:click=move |_| crate::desktop::sign_in()>"Войти в Codex"</button></Show>
            <a class="text-button" href=berserk_leptos::deck_prompt::ARTICLE_URL target="_blank" rel="noopener noreferrer">"Основы колодостроения ↗"</a>
        </div>
        <Show when=move || ctx.user.with(UserData::total)==0><p class="error">"Сначала добавьте карты в коллекцию."</p></Show>
        <Show when=move || !ctx.agent_connected.get()><p class="muted">{if crate::desktop::available() {"Подключаем Codex…"} else {"Для запуска подключите локальный сервис — инструкция ниже."}}</p></Show>
        <p role="status" class:error=move || ctx.build_progress.with(|p|p.phase=="failed")>{move || ctx.build_progress.get().message}</p>
        <p role="status">{move || message.get()}</p>
        {move || prompt.get().err().map(|error| view! {<p class="error">{error}</p>})}
        <details class="codex-prompt"><summary>"Посмотреть запрос"</summary><textarea aria-label="Запрос для Codex" rows="12" readonly prop:value=move || prompt.get().unwrap_or_default()/></details>
        <Show when=crate::desktop::available><p class="muted">"Если вы ещё не входили в Codex, нажмите «Войти в Codex». Вход откроется в браузере. После этого создавайте колоды здесь — дополнительных приложений запускать не нужно. Правила и количество карт передаются Codex; покупные цены не передаются."</p></Show>
        <Show when=|| !crate::desktop::available()><details class="codex-setup"><summary>"Как подключить Codex"</summary><ol>
            <li>"Установите Codex CLI и войдите в аккаунт командой "<code>"codex login"</code>"."</li>
            <li>"В папке приложения запустите "<code>"make ai"</code>" и откройте напечатанную ссылку в браузере с вашей коллекцией."</li>
            <li>"Нажмите «Создать колоду». Сервис передаст Codex названия, правила и количество ваших карт, затем проверит и сохранит результат. Покупные цены не передаются."</li>
            <li>"Если Berserk MCP уже подключён к Codex, достаточно открыть ссылку из connection_info."</li>
        </ol></details></Show>
    </details>}
}

#[component]
fn AllowedSetsPicker(selected: RwSignal<Vec<u16>>) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let open = RwSignal::new(false);
    let root = NodeRef::<leptos::html::Div>::new();
    let trigger = NodeRef::<leptos::html::Button>::new();
    let panel_id = format!("allowed-sets-{}", new_id());
    // Close on click (not pointerdown): collapsing the menu must not move
    // the modal under the pointer before the click reaches its original target.
    let outside = wasm_bindgen::closure::Closure::<dyn Fn(web_sys::MouseEvent)>::new(
        move |event: web_sys::MouseEvent| {
            if let (Some(root), Some(target)) = (
                root.get(),
                event
                    .target()
                    .and_then(|t| t.dyn_into::<web_sys::Node>().ok()),
            ) && !root.contains(Some(&target))
            {
                open.set(false);
            }
        },
    );
    let document = document();
    let _ = document.add_event_listener_with_callback_and_bool(
        "click",
        outside.as_ref().unchecked_ref(),
        true,
    );
    let listener = StoredValue::new_local(Some((document, outside)));
    on_cleanup(move || {
        listener.update_value(|listener| {
            if let Some((document, outside)) = listener.take() {
                let _ = document.remove_event_listener_with_callback_and_bool(
                    "click",
                    outside.as_ref().unchecked_ref(),
                    true,
                );
            }
        })
    });
    let label = move || {
        let sets = selected.get();
        if sets.len() == ctx.cat().constants.sets.len() {
            "Все наборы".to_string()
        } else if sets.is_empty() {
            "Выберите наборы".to_string()
        } else if sets.len() == 1 {
            ctx.cat().set_name(sets[0])
        } else {
            format!("Выбрано наборов: {}", sets.len())
        }
    };
    view! {<fieldset class="allowed-sets-picker"><legend>"Разрешённые наборы"</legend>
        <div class="allowed-sets-dropdown" node_ref=root on:keydown=move |event| {
            if event.key() == "Escape" && open.get_untracked() {
                event.stop_propagation(); event.prevent_default(); open.set(false);
                if let Some(button) = trigger.get() { let _ = button.focus(); }
            }
        }>
            <button type="button" class="allowed-sets-trigger" node_ref=trigger aria-label="Выбрать разрешённые наборы" aria-expanded=move || open.get().to_string() aria-controls=panel_id.clone() on:click=move |_|open.update(|v|*v = !*v)>
                <span>{label}</span><span class="allowed-sets-chevron" class:expanded=move || open.get() aria-hidden="true">"⌄"</span>
            </button>
            <Show when=move || open.get()>
                <div class="allowed-sets-menu" id=panel_id.clone() role="group" aria-label="Список разрешённых наборов">
                    <div class="allowed-sets-actions"><button type="button" class="text-button" on:click=move |_| {let sets=ctx.cat().set_ids();selected.set(sets.clone());ctx.remember_allowed_sets(sets);}>"Выбрать все"</button><button type="button" class="text-button" on:click=move |_| selected.set(vec![])>"Снять выбор"</button></div>
                    <div class="allowed-sets-options">{ctx.cat().constants.sets.iter().rev().map(|(id, name)| {
                        let id: u16 = id.parse().expect("Catalog set ID");
                        view!{<label class="check"><input type="checkbox" prop:checked=move || selected.with(|sets| sets.contains(&id)) on:change=move |e| {
                            let checked = event_target_checked(&e);
                            selected.update(|sets| { sets.retain(|s| *s != id); if checked { sets.push(id); sets.sort_unstable(); } });
                            ctx.remember_allowed_sets(selected.get_untracked());
                        }/><span>{name.clone()}</span></label>}
                    }).collect_view()}</div>
                </div>
            </Show>
        </div>
        <p class="muted">"Ограничение действует на колоду, запас и рекомендации Codex."</p>
    </fieldset>}
}

#[component]
pub fn NewDeckDialog(deck: Deck) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let name = RwSignal::new(deck.name.clone());
    let selected = RwSignal::new(
        deck.allowed_sets
            .clone()
            .unwrap_or_else(|| ctx.cat().set_ids()),
    );
    let draft = StoredValue::new(deck);
    let error = Memo::new(move |_| {
        let mut deck = draft.get_value();
        deck.allowed_sets = Some(selected.get());
        deck.validate_sets(&ctx.cat()).err()
    });
    view! {<div class="modal-backdrop" on:click=move |_| ctx.new_deck_draft.set(None)><section class="modal transfer-modal" role="dialog" aria-modal="true" aria-label="Новая колода" class:new-deck-modal=true on:click=|e|e.stop_propagation()>
        <button class="modal-close" aria-label="Закрыть создание колоды" on:click=move |_|ctx.new_deck_draft.set(None)>"×"</button>
        <h2>"Новая колода"</h2><label>"Название колоды"<input autofocus prop:value=move || name.get() on:input=move |e|name.set(event_target_value(&e))/></label>
        <AllowedSetsPicker selected/>
        {move || error.get().map(|e|view!{<p class="error">{e}</p>})}
        <div class="intro-actions"><button class="button primary" disabled=move || error.get().is_some() || name.with(|n|n.trim().is_empty()) on:click=move |_| {
            let mut deck=draft.get_value(); deck.name=name.get_untracked().trim().into(); deck.allowed_sets=Some(selected.get_untracked());
            if let Err(e)=deck.validate_sets(&ctx.cat()) {ctx.toast.set(e);return;}
            let id=deck.id.clone();ctx.change(|u|u.decks.insert(0,deck));ctx.active.set(Some(id));ctx.side.set(false);ctx.new_deck_draft.set(None);ctx.detail.set(None);ctx.navigate(Page::Decks);
        }>"Создать колоду"</button><button class="button" on:click=move |_|ctx.new_deck_draft.set(None)>"Отмена"</button></div>
    </section></div>}
}

#[component]
fn DeckAllowedSets() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let editing = RwSignal::new(false);
    let selected = RwSignal::new(Vec::<u16>::new());
    let error = Memo::new(move |_| {
        let mut deck = ctx.deck()?;
        deck.allowed_sets = Some(selected.get());
        deck.validate_sets(&ctx.cat()).err()
    });
    view! {<section class="deck-set-settings">
        <div class="deck-notes-toolbar"><strong>"Разрешённые наборы"</strong><button class="text-button" on:click=move |_| {
            selected.set(ctx.deck_untracked().and_then(|d|d.allowed_sets).unwrap_or_else(||ctx.cat().set_ids()));editing.update(|v|*v = !*v);
        }>{move || if editing.get(){"Отмена"}else{"Изменить"}}</button></div>
        <Show when=move || !editing.get()><p class="muted">{move || ctx.deck().map(|d|d.allowed_sets.map(|sets|sets.iter().map(|id|ctx.cat().set_name(*id)).collect::<Vec<_>>().join(" · ")).unwrap_or_else(||"Все наборы".into())).unwrap_or_default()}</p></Show>
        <Show when=move || editing.get()><AllowedSetsPicker selected/>
            {move || error.get().map(|e|view!{<p class="error">{e}</p>})}
            <button class="button" disabled=move || error.get().is_some() on:click=move |_|{ctx.edit_deck(|d|d.allowed_sets=Some(selected.get_untracked()));editing.set(false);}>"Сохранить наборы"</button>
        </Show>
    </section>}
}

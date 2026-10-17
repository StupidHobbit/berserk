use crate::app::{Ctx, Page, STORAGE};
use berserk_leptos::agent::{BrowserCommand, BrowserReply, BrowserRequest, apply_command};
use leptos::prelude::*;
use wasm_bindgen::{JsCast, closure::Closure};
use web_sys::{Event, MessageEvent, WebSocket};

struct BrowserLink {
    socket: WebSocket,
    _message: Closure<dyn FnMut(MessageEvent)>,
    _open: Closure<dyn FnMut(Event)>,
    _close: Closure<dyn FnMut(Event)>,
}
impl Drop for BrowserLink {
    fn drop(&mut self) {
        self.socket.set_onmessage(None);
        self.socket.set_onopen(None);
        self.socket.set_onclose(None);
        self.socket.set_onerror(None);
        let _ = self.socket.close();
    }
}
fn connect_from_hash(
    ctx: Ctx,
    link: StoredValue<Option<BrowserLink>, LocalStorage>,
    status: RwSignal<String>,
    connected: RwSignal<bool>,
) {
    let desktop_pair = crate::desktop::pair();
    let desktop = !desktop_pair.is_empty();
    if desktop
        && link.with_value(|l| {
            l.as_ref().is_some_and(|l| {
                matches!(
                    l.socket.ready_state(),
                    WebSocket::OPEN | WebSocket::CONNECTING
                )
            })
        })
    {
        return;
    }
    let hash = window().location().hash().unwrap_or_default();
    let Some(pair) = (if desktop {
        Some(desktop_pair.as_str())
    } else {
        hash.strip_prefix("#agent=")
    }) else {
        return;
    };
    let hostname = window().location().hostname().unwrap_or_default();
    let parsed = pair.split_once(':').and_then(|(port, token)| {
        let port = port.parse::<u16>().ok()?;
        (port > 0 && token.len() == 32 && token.bytes().all(|c| c.is_ascii_hexdigit()))
            .then_some((port, token.to_string()))
    });
    // Remove the session secret from the current URL immediately.
    if !desktop {
        let _ = window().history().and_then(|h| {
            h.replace_state_with_url(&wasm_bindgen::JsValue::NULL, "", Some("#decks"))
        });
        ctx.page.set(Page::Decks);
    }
    if !matches!(hostname.as_str(), "localhost" | "127.0.0.1") || parsed.is_none() {
        status.set("Некорректная ссылка подключения агента.".into());
        return;
    }
    link.update_value(|value| *value = None);
    connected.set(false);
    let (port, token) = parsed.expect("Checked pair");
    let Ok(socket) = WebSocket::new(&format!("ws://127.0.0.1:{port}/bridge?token={token}")) else {
        status.set("Не удалось подключить агента. Получите новую ссылку connection_info.".into());
        return;
    };
    status.set("Подключение агента…".into());
    let on_open = Closure::new(move |_: Event| {
        connected.set(true);
        status.set(
            if desktop {
                "Codex готов к созданию колод"
            } else {
                "Агент подключён · доступ к коллекции и колодам"
            }
            .into(),
        );
    });
    let on_close = Closure::new(move |_: Event| {
        connected.set(false);
        ctx.build_progress.update(|p| { if p.busy() { p.phase = "failed".into(); p.message = "Соединение потеряно. Перед повтором проверьте список колод: сохранение могло завершиться.".into(); } });
        status.set(if desktop {"Соединение с Codex потеряно. Нажмите «Подключить». Если это не поможет, перезапустите Berserk."} else {"Агент отключён. Для подключения откройте новую ссылку connection_info."}.into());
    });
    let reply_socket = socket.clone();
    let on_message = Closure::new(move |event: MessageEvent| {
        let Some(text) = event.data().as_string() else {
            return;
        };
        if text.len() > 2 * 1024 * 1024 {
            let _ = reply_socket.close();
            return;
        }
        let Ok(request) = serde_json::from_str::<BrowserRequest>(&text) else {
            let _ = reply_socket.close();
            return;
        };
        let mut next = ctx.user.get_untracked();
        let saving = matches!(&request.command, BrowserCommand::SaveDeck { .. });
        let deck_id = match &request.command {
            BrowserCommand::SaveDeck { deck, .. } => Some(deck.id.clone()),
            _ => None,
        };
        let result = (|| -> Result<serde_json::Value, String> {
            if let BrowserCommand::BuildProgress { progress } = &request.command {
                ctx.build_progress.set(progress.clone());
                return Ok(serde_json::json!({"received":true}));
            }
            if saving && !ctx.storage_ok.get_untracked() {
                return Err("Browser storage is unavailable; resolve the app storage warning before saving.".into());
            }
            let result = apply_command(&mut next, &ctx.cat(), request.command)?;
            if saving {
                // Acknowledge only after durable browser storage succeeds.
                let raw = serde_json::to_string(&next).map_err(|e| e.to_string())?;
                window()
                    .local_storage()
                    .ok()
                    .flatten()
                    .ok_or("Browser storage unavailable")?
                    .set_item(STORAGE, &raw)
                    .map_err(|_| "Could not persist deck in browser storage")?;
                ctx.change(|user| *user = next);
                ctx.active.set(deck_id);
                ctx.side.set(false);
                ctx.navigate(Page::Decks);
                ctx.toast
                    .set("Агент сохранил колоду. Изменение можно отменить в редакторе.".into());
            }
            Ok(result)
        })();
        let reply = BrowserReply {
            id: request.id,
            result,
        };
        if let Ok(text) = serde_json::to_string(&reply) {
            let _ = reply_socket.send_with_str(&text);
        }
    });
    socket.set_onopen(Some(on_open.as_ref().unchecked_ref()));
    socket.set_onclose(Some(on_close.as_ref().unchecked_ref()));
    socket.set_onerror(Some(on_close.as_ref().unchecked_ref()));
    socket.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
    link.set_value(Some(BrowserLink {
        socket,
        _message: on_message,
        _open: on_open,
        _close: on_close,
    }));
}
#[component]
pub fn AgentConnection() -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let link = StoredValue::new_local(None::<BrowserLink>);
    let status = RwSignal::new(String::new());
    let connected = ctx.agent_connected;
    Effect::new(move |_| connect_from_hash(ctx, link, status, connected));
    Effect::new(move |_| {
        if let Some(event) = ctx.build_event.get() {
            let sent = link.with_value(|link| {
                link.as_ref().is_some_and(|l| {
                    l.socket.ready_state() == WebSocket::OPEN
                        && serde_json::to_string(&event)
                            .ok()
                            .is_some_and(|text| l.socket.send_with_str(&text).is_ok())
                })
            });
            if !sent {
                ctx.build_progress.update(|p| {
                    p.phase = "failed".into();
                    p.message = "Сначала подключите локальный сервис Codex.".into();
                });
            }
        }
    });
    let _ = window_event_listener(leptos::ev::hashchange, move |_| {
        connect_from_hash(ctx, link, status, connected)
    });
    on_cleanup(move || link.update_value(|value| *value = None));
    view! {
        <Show when=move || !status.get().is_empty() && (!crate::desktop::available() || !connected.get())>
            <section class="agent-connection" aria-label="Подключение агента">
                <span role="status">{move || status.get()}</span>
                <button class="text-button" on:click=move |_| {
                    if crate::desktop::available() {
                        connect_from_hash(ctx, link, status, connected);
                        return;
                    }
                    link.update_value(|value|*value=None);
                    connected.set(false);
                    ctx.build_progress.update(|p| { if p.busy() { p.phase = "failed".into(); p.message = "Сервис отключён. Проверьте список колод перед повтором.".into(); } });
                    status.set(String::new());
                }>{move || if crate::desktop::available() {"Подключить"} else if connected.get() {"Отключить агента"} else {"Закрыть"}}</button>
            </section>
        </Show>
    }
}

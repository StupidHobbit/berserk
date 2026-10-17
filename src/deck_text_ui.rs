use crate::app::Ctx;
use leptos::prelude::*;
use wasm_bindgen::JsCast;

#[component]
pub fn DeckText(text: String) -> impl IntoView {
    let ctx = expect_context::<Ctx>();
    let rendered = berserk_leptos::deck_text::render(&text, &ctx.cat());
    view! {
        <div class="deck-prose" inner_html=rendered on:click=move |event| {
            let Some(element) = event.target().and_then(|target| target.dyn_into::<web_sys::Element>().ok()) else { return; };
            let Some(button) = element.closest("button[data-deck-card-id]").ok().flatten() else { return; };
            let Some(id) = button.get_attribute("data-deck-card-id") else { return; };
            if ctx.cat().get(&id).is_some() {
                event.prevent_default();
                ctx.detail.set(Some(id));
            }
        }/>
    }
}

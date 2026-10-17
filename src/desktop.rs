use wasm_bindgen::prelude::*;

#[wasm_bindgen(
    inline_js = "export function desktopPair() { return window.__BERSERK_DESKTOP || ''; } export function desktopAction(action, payload) { window.webkit.messageHandlers.berserk.postMessage({action, payload}); }"
)]
extern "C" {
    #[wasm_bindgen(js_name = desktopPair)]
    pub fn pair() -> String;
    #[wasm_bindgen(js_name = desktopAction)]
    fn action(action: &str, payload: &str);
}

pub fn available() -> bool {
    !pair().is_empty()
}

pub fn sign_in() {
    action("login", "");
}

pub fn save(name: &str, text: &str) -> bool {
    if !available() {
        return false;
    }
    action(
        "save",
        &serde_json::json!({"name": name, "text": text}).to_string(),
    );
    true
}

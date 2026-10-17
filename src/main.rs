mod agent_ui;
mod app;
mod deck_text_ui;
mod decks;
mod desktop;
mod foil;

fn main() {
    console_error_panic_hook::set_once();
    leptos::mount::mount_to_body(app::App);
}

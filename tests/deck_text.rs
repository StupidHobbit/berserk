use berserk_leptos::{deck_text::render, model::Catalog};

#[test]
fn card_ids_resolve_to_database_names_and_exact_editions() {
    let cat = Catalog::load().unwrap();
    for id in ["80001", "80001f"] {
        let html = render(&format!("Используйте **[card:{id}]**."), &cat);
        let card = cat.get(id).unwrap();
        assert!(
            html.contains(&format!("data-deck-card-id=\"{id}\"")),
            "{html}"
        );
        assert!(html.contains(&card.name));
        assert!(html.contains("aria-haspopup=\"dialog\""));
        assert!(html.contains("<strong><button"));
        assert!(!html.contains(&format!("[card:{id}]")));
    }
    let html = render("[invented name](card:80001)", &cat);
    assert!(html.contains(&cat.get("80001").unwrap().name));
    assert!(!html.contains("invented name"));
}

#[test]
fn unknown_ids_literal_code_and_escaped_references_stay_readable() {
    let cat = Catalog::load().unwrap();
    for source in [
        "[card:unknown]",
        "[card:]",
        "`[card:80001]`",
        "```\n[card:80001]\n```",
        r"\[card:80001]",
    ] {
        let html = render(source, &cat);
        assert!(!html.contains("data-deck-card-id"), "{source}: {html}");
        assert!(html.contains("[card:"), "{html}");
    }
}

#[test]
fn markdown_formats_notes_and_preserves_plain_text_line_breaks() {
    let cat = Catalog::load().unwrap();
    let html = render(
        "## План\n\n- **Первый**\n- *Второй*\n\nСтрока\nЕщё строка",
        &cat,
    );
    for expected in [
        "<h2>План</h2>",
        "<ul>",
        "<strong>Первый</strong>",
        "<em>Второй</em>",
        "<br />",
    ] {
        assert!(html.contains(expected), "{html}");
    }
}

#[test]
fn imported_html_and_unsafe_links_cannot_inject_actions_or_fetch_images() {
    let cat = Catalog::load().unwrap();
    let html = render(
        r#"<script>alert(1)</script>

<button data-deck-card-id="80001" onclick="alert(1)">Fake</button>

[click](javascript:alert%281%29) ![image](https://example.com/tracker.png)

[safe](https://example.com/?a=1&b=2) [card:80001]
"#,
        &cat,
    );
    assert!(!html.contains("<script"));
    assert!(!html.contains("<img"));
    assert!(!html.contains("href=\"javascript:"));
    for tag in html
        .split('<')
        .skip(1)
        .filter_map(|part| part.split_once('>').map(|(tag, _)| tag))
    {
        assert!(!tag.contains("onclick="), "{html}");
    }
    assert!(html.contains("&lt;script&gt;"));
    assert!(html.contains("rel=\"noopener noreferrer\""));
    assert_eq!(html.matches("<button ").count(), 1);
}

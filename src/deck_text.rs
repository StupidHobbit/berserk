//! Safe Markdown for deck notes, with database-backed `[card:ID]` references.
use crate::model::Catalog;
use pulldown_cmark::{BrokenLink, CowStr, Event, Options, Parser, Tag, TagEnd, html};

pub const CARD_MARKDOWN_GUIDANCE: &str = "В description, how_to_play и improvements используй Markdown: короткие заголовки, списки, **выделение**. Вместо написания имени карты используй [card:ID], например [card:80001]. Приложение само подставит имя из базы и откроет описание по клику. Указывай только проверенные точные ID (включая суффикс издания, если нужен). Не заключай ссылки на карты в обратные кавычки: тогда они будут показаны как код. В cards сохраняй обычные ID без разметки.";

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Raw HTML is escaped, external links allow only HTTP(S), and images never load.
/// Only this renderer can emit a card button, after resolving its exact database ID.
pub fn render(text: &str, cat: &Catalog) -> String {
    let callback = |link: BrokenLink<'_>| {
        let id = link.reference.strip_prefix("card:")?;
        cat.get(id)?;
        Some((CowStr::from(format!("card:{id}")), CowStr::from("")))
    };
    let parser =
        Parser::new_with_broken_link_callback(text, Options::ENABLE_STRIKETHROUGH, Some(callback));
    let mut output = Vec::new();
    let mut card_label = false;
    let mut external_link = false;
    let mut image_depth = 0;
    for event in parser {
        if image_depth > 0 {
            match event {
                Event::Start(Tag::Image { .. }) => image_depth += 1,
                Event::End(TagEnd::Image) => image_depth -= 1,
                Event::Text(_) | Event::Code(_) => output.push(event),
                _ => {}
            }
            continue;
        }
        if card_label {
            if matches!(event, Event::End(TagEnd::Link)) {
                card_label = false;
            }
            continue;
        }
        match event {
            Event::Start(Tag::Link { dest_url, .. }) => {
                if let Some(card) = dest_url.strip_prefix("card:").and_then(|id| cat.get(id)) {
                    let title = format!("{} · {} · {}", card.name, cat.edition_name(card), card.id);
                    output.push(Event::Html(format!(
                        "<button type=\"button\" class=\"deck-card-link\" data-deck-card-id=\"{}\" title=\"{}\" aria-haspopup=\"dialog\">{}</button>",
                        escape(&card.id), escape(&title), escape(&card.name)
                    ).into()));
                    card_label = true;
                } else {
                    external_link =
                        dest_url.starts_with("https://") || dest_url.starts_with("http://");
                    if external_link {
                        output.push(Event::Html(
                            format!(
                                "<a href=\"{}\" target=\"_blank\" rel=\"noopener noreferrer\">",
                                escape(&dest_url)
                            )
                            .into(),
                        ));
                    }
                }
            }
            Event::End(TagEnd::Link) => {
                if external_link {
                    output.push(Event::Html("</a>".into()));
                }
                external_link = false;
            }
            Event::Start(Tag::Image { .. }) => image_depth += 1,
            Event::End(TagEnd::Image) => {}
            Event::Html(raw) | Event::InlineHtml(raw) => output.push(Event::Text(raw)),
            // Keep existing plain-text notes' intentional line breaks.
            Event::SoftBreak => output.push(Event::HardBreak),
            other => output.push(other),
        }
    }
    let mut rendered = String::new();
    html::push_html(&mut rendered, output.into_iter());
    rendered
}

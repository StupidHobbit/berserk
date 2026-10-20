//! Native Markdown presentation with the same safe card/link semantics as web notes.
use crate::model::Catalog;
use eframe::egui::{self, RichText};
use pulldown_cmark::{BrokenLink, CowStr, Event, Options, Parser, Tag, TagEnd};

pub fn show(ui: &mut egui::Ui, text: &str, cat: &Catalog) -> Option<String> {
    let callback = |link: BrokenLink<'_>| {
        let id = link.reference.strip_prefix("card:")?;
        cat.get(id)?;
        Some((CowStr::from(format!("card:{id}")), CowStr::from("")))
    };
    let parser =
        Parser::new_with_broken_link_callback(text, Options::ENABLE_STRIKETHROUGH, Some(callback));
    let mut selected = None;
    let mut strong = false;
    let mut italic = false;
    let mut strike = false;
    let mut heading = false;
    let mut link: Option<String> = None;
    let mut skip_card = false;
    let mut line: Vec<(RichText, Option<String>)> = Vec::new();
    let mut lists: Vec<Option<u64>> = Vec::new();
    let flush = |ui: &mut egui::Ui,
                 line: &mut Vec<(RichText, Option<String>)>,
                 selected: &mut Option<String>| {
        if line.is_empty() {
            return;
        }
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing.x = 0.0;
            for (text, link) in line.drain(..) {
                if let Some(link) = link {
                    if let Some(id) = link.strip_prefix("card:") {
                        if ui.link(text).clicked() {
                            *selected = Some(id.into());
                        }
                    } else if link.starts_with("https://") || link.starts_with("http://") {
                        ui.hyperlink_to(text, link);
                    } else {
                        ui.label(text);
                    }
                } else {
                    ui.label(text);
                }
            }
        });
    };
    for event in parser {
        if skip_card {
            if matches!(event, Event::End(TagEnd::Link)) {
                skip_card = false;
                link = None;
            }
            continue;
        }
        match event {
            Event::Start(Tag::Strong) => strong = true,
            Event::End(TagEnd::Strong) => strong = false,
            Event::Start(Tag::Emphasis) => italic = true,
            Event::End(TagEnd::Emphasis) => italic = false,
            Event::Start(Tag::Strikethrough) => strike = true,
            Event::End(TagEnd::Strikethrough) => strike = false,
            Event::Start(Tag::Heading { .. }) => {
                flush(ui, &mut line, &mut selected);
                heading = true;
            }
            Event::End(TagEnd::Heading(_)) => {
                flush(ui, &mut line, &mut selected);
                heading = false;
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                if let Some(card) = dest_url.strip_prefix("card:").and_then(|id| cat.get(id)) {
                    line.push((RichText::new(&card.name), Some(dest_url.to_string())));
                    skip_card = true;
                } else {
                    link = Some(dest_url.to_string());
                }
            }
            Event::End(TagEnd::Link) => link = None,
            Event::Start(Tag::List(number)) => {
                flush(ui, &mut line, &mut selected);
                lists.push(number);
            }
            Event::End(TagEnd::List(_)) => {
                flush(ui, &mut line, &mut selected);
                lists.pop();
            }
            Event::Start(Tag::Item) => {
                flush(ui, &mut line, &mut selected);
                let prefix = match lists.last_mut() {
                    Some(Some(n)) => {
                        let s = format!("{n}. ");
                        *n += 1;
                        s
                    }
                    _ => "• ".into(),
                };
                line.push((RichText::new(prefix), None));
            }
            Event::End(
                TagEnd::Paragraph | TagEnd::Item | TagEnd::CodeBlock | TagEnd::BlockQuote(_),
            )
            | Event::SoftBreak
            | Event::HardBreak => flush(ui, &mut line, &mut selected),
            Event::Text(text) | Event::Html(text) | Event::InlineHtml(text) => {
                let mut text = RichText::new(text.to_string());
                if strong {
                    text = text.strong();
                }
                if italic {
                    text = text.italics();
                }
                if strike {
                    text = text.strikethrough();
                }
                if heading {
                    text = text.heading();
                }
                line.push((text, link.clone()));
            }
            Event::Code(text) => line.push((RichText::new(text.to_string()).monospace(), None)),
            Event::Rule => {
                flush(ui, &mut line, &mut selected);
                ui.separator();
            }
            _ => {}
        }
    }
    flush(ui, &mut line, &mut selected);
    selected
}

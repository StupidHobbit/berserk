//! Compact deck metadata and the cost histogram, drawn at native UI resolution.
use super::skin;
use crate::model::{Card, Catalog, Stats, grouped};
use eframe::egui::{self, Align2, Color32, FontId, Sense, Stroke};

pub(super) fn sorted_cards<'a>(ids: &[String], cat: &'a Catalog) -> Vec<(&'a Card, usize)> {
    let mut cards: Vec<_> = grouped(ids)
        .into_iter()
        .filter_map(|(id, count)| cat.get(&id).map(|card| (card, count)))
        .collect();
    cards.sort_by(|(a, _), (b, _)| {
        (a.set_id, a.number, &a.alt, &a.id).cmp(&(b.set_id, b.number, &b.alt, &b.id))
    });
    cards
}

pub(super) fn coin(ui: &mut egui::Ui, cost: u16, gold: bool) {
    let (rect, response) = ui.allocate_exact_size(egui::vec2(26.0, 26.0), Sense::hover());
    let fill = if gold {
        skin::GOLD
    } else {
        Color32::from_rgb(193, 203, 208)
    };
    let rim = if gold {
        Color32::from_rgb(132, 93, 37)
    } else {
        Color32::from_rgb(100, 118, 128)
    };
    let painter = ui.painter();
    painter.circle_filled(rect.center() + egui::vec2(0.0, 1.0), 12.0, rim);
    painter.circle_filled(rect.center(), 11.5, fill);
    painter.circle_stroke(rect.center(), 9.0, Stroke::new(0.8, rim));
    painter.text(
        rect.center(),
        Align2::CENTER_CENTER,
        cost.to_string(),
        FontId::proportional(13.0),
        skin::INK,
    );
    response.on_hover_text(format!(
        "{cost} {}",
        if gold {
            "золота"
        } else {
            "серебра"
        }
    ));
}

pub(super) fn move_button(ui: &mut egui::Ui, side: bool) -> egui::Response {
    let response = ui.add_sized([22.0, 26.0], egui::Button::new(""));
    let center = response.rect.center();
    let stroke = ui.style().interact(&response).fg_stroke;
    ui.painter().arrow(
        center + egui::vec2(-5.0, -3.0),
        egui::vec2(10.0, 0.0),
        stroke,
    );
    ui.painter().arrow(
        center + egui::vec2(5.0, 3.0),
        egui::vec2(-10.0, 0.0),
        stroke,
    );
    let label = if side {
        "В колоду"
    } else {
        "В запас"
    };
    response.widget_info(|| {
        egui::WidgetInfo::labeled(egui::WidgetType::Button, ui.is_enabled(), label)
    });
    response.on_hover_text(label)
}

// Reuse the original printed set medallions, not approximate/thematic drawings.
// These bundled base scans are all 496 × 700; the medallion is at (468.5, 673.5).
// Decode once per set/context and retain only the tiny cropped GPU texture.
fn set_scan(set: u16) -> Option<&'static [u8]> {
    Some(match set {
        10 => include_bytes!("../../public/cards/10/1.webp"),
        20 => include_bytes!("../../public/cards/20/1.webp"),
        21 => include_bytes!("../../public/cards/21/1.webp"),
        22 => include_bytes!("../../public/cards/22/1.webp"),
        30 => include_bytes!("../../public/cards/30/1.webp"),
        40 => include_bytes!("../../public/cards/40/1.webp"),
        50 => include_bytes!("../../public/cards/50/1.webp"),
        60 => include_bytes!("../../public/cards/60/1.webp"),
        70 => include_bytes!("../../public/cards/70/1.webp"),
        80 => include_bytes!("../../public/cards/80/1.jpg"),
        _ => return None,
    })
}

fn set_icon_image(set: u16) -> Option<egui::ColorImage> {
    let scan = image::load_from_memory(set_scan(set)?).expect("bundled set scan must decode");
    let mut pixels = scan.crop_imm(456, 661, 25, 25).to_rgba8();
    // Clip the surrounding card frame without changing the printed medallion.
    for (x, y, pixel) in pixels.enumerate_pixels_mut() {
        let distance = ((x as f32 - 12.0).powi(2) + (y as f32 - 12.0).powi(2)).sqrt();
        pixel[3] = ((12.5 - distance).clamp(0.0, 1.0) * 255.0).round() as u8;
    }
    Some(egui::ColorImage::from_rgba_unmultiplied(
        [25, 25],
        pixels.as_raw(),
    ))
}

pub(super) fn set_icon(ui: &mut egui::Ui, set: u16, name: &str) {
    let (rect, response) = ui.allocate_exact_size(egui::vec2(20.0, 24.0), Sense::hover());
    let key = egui::Id::new(("printed-set-pictogram", set));
    let texture = ui
        .ctx()
        .data_mut(|data| data.get_temp::<egui::TextureHandle>(key))
        .or_else(|| {
            let texture = ui.ctx().load_texture(
                format!("set-{set}"),
                set_icon_image(set)?,
                egui::TextureOptions::LINEAR,
            );
            ui.ctx()
                .data_mut(|data| data.insert_temp(key, texture.clone()));
            Some(texture)
        });
    if let Some(texture) = texture {
        ui.painter().image(
            texture.id(),
            egui::Rect::from_center_size(rect.center(), egui::vec2(20.0, 20.0)),
            egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
            Color32::WHITE,
        );
    } else {
        ui.painter().text(
            rect.center(),
            Align2::CENTER_CENTER,
            set.to_string(),
            FontId::proportional(11.0),
            skin::GOLD,
        );
    }
    response.on_hover_text(name);
}

pub(super) fn histogram(ui: &mut egui::Ui, stats: &Stats) {
    ui.small("Количество карт");
    if stats.total == 0 {
        ui.weak("Добавьте карты, чтобы увидеть распределение стоимости.");
        return;
    }
    // Keep equal-width integer bins, including gaps and zero-cost cards.
    // An overflow bin keeps imported high costs readable in a narrow panel.
    let first = if stats.curve.contains_key(&0) { 0 } else { 1 };
    let last = stats
        .curve
        .keys()
        .next_back()
        .copied()
        .unwrap_or(10)
        .clamp(10, 12);
    let bins: Vec<(u16, usize)> = (first..=last)
        .map(|cost| {
            let n = if cost == 12 {
                stats.curve.range(12..).map(|(_, n)| n).sum()
            } else {
                stats.curve.get(&cost).copied().unwrap_or(0)
            };
            (cost, n)
        })
        .collect();
    let max = bins.iter().map(|(_, n)| *n).max().unwrap_or(1).max(1);
    let (rect, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 132.0), Sense::hover());
    let plot = egui::Rect::from_min_max(
        rect.min + egui::vec2(0.0, 18.0),
        rect.max - egui::vec2(0.0, 23.0),
    );
    let painter = ui.painter();
    painter.line_segment(
        [plot.left_bottom(), plot.right_bottom()],
        Stroke::new(1.0, Color32::from_gray(110)),
    );
    let step = plot.width() / bins.len() as f32;
    for (index, (cost, count)) in bins.iter().enumerate() {
        let x = plot.left() + (index as f32 + 0.5) * step;
        let height = plot.height() * *count as f32 / max as f32;
        let bar = egui::Rect::from_min_max(
            egui::pos2(x - step * 0.38, plot.bottom() - height),
            egui::pos2(x + step * 0.38, plot.bottom()),
        );
        if *count > 0 {
            painter.rect_filled(bar, 2.0, skin::GOLD);
            painter.text(
                egui::pos2(x, bar.top() - 3.0),
                Align2::CENTER_BOTTOM,
                count.to_string(),
                FontId::proportional(11.0),
                Color32::WHITE,
            );
        }
        let label = if *cost == 12 {
            "12+".into()
        } else {
            cost.to_string()
        };
        painter.text(
            egui::pos2(x, plot.bottom() + 6.0),
            Align2::CENTER_TOP,
            &label,
            FontId::proportional(11.0),
            skin::GOLD,
        );
        let hit = egui::Rect::from_min_max(
            egui::pos2(x - step / 2.0, rect.top()),
            egui::pos2(x + step / 2.0, rect.bottom()),
        );
        ui.interact(hit, ui.id().with(("cost", cost)), Sense::hover())
            .on_hover_text(format!("Стоимость {label}: {count} карт"));
    }
    ui.small("Стоимость");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deck_order_uses_numeric_set_and_number_and_keeps_editions_and_counts() {
        let cat = Catalog::load().unwrap();
        let ids = ["80010", "10010", "10002", "80010", "10007pf", "20001"].map(str::to_string);
        let cards = sorted_cards(&ids, &cat);
        assert_eq!(
            cards
                .iter()
                .map(|(c, n)| (c.id.as_str(), *n))
                .collect::<Vec<_>>(),
            vec![
                ("10002", 1),
                ("10007pf", 1),
                ("10010", 1),
                ("20001", 1),
                ("80010", 2)
            ]
        );
    }
}

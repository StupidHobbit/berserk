//! The original deck builder's “Подробно” / “Карты” view switch.
use super::*;
use eframe::egui::RichText;

/// Chance of at least `minimum` copies in a hand drawn without replacement.
/// Multiplicative binomials remain finite for the supported 10,000-card decks
/// because a hand contains at most 15 cards.
fn draw_chance(total: usize, copies: usize, minimum: usize) -> f64 {
    let copies = copies.min(total);
    let hand = total.min(15);
    fn choose(n: usize, k: usize) -> f64 {
        if k > n {
            return 0.0;
        }
        let k = k.min(n - k);
        (0..k).fold(1.0, |result, i| result * (n - i) as f64 / (i + 1) as f64)
    }
    (minimum..=copies.min(hand))
        .map(|n| choose(copies, n) * choose(total - copies, hand - n) / choose(total, hand))
        .sum::<f64>()
        .clamp(0.0, 1.0)
}

impl NativeApp {
    pub(super) fn deck_overview(&mut self, ui: &mut egui::Ui) {
        let Some(deck) = self.deck().cloned() else {
            return;
        };
        ui.heading(&deck.name);
        let mut life = 0u64;
        let mut hit = [0u64; 3];
        for card in deck.cards.iter().filter_map(|id| self.cat.get(id)) {
            life += u64::from(card.life.unwrap_or(0));
            if let Some(values) = &card.hit {
                for (sum, value) in hit.iter_mut().zip(values) {
                    *sum += u64::from(*value);
                }
            }
        }
        ui.horizontal_wrapped(|ui| {
            ui.strong(format!(
                "Колода: {} · Запас: {}",
                deck.cards.len(),
                deck.side.len()
            ));
            ui.label(format!(
                "Здоровье: {life} · Удар: {}–{}–{}",
                hit[0], hit[1], hit[2]
            ));
        });
        ui.label(format!(
            "Над картой — шанс получить 1+, 2+, 3+ копии в раздаче из {} карт.",
            deck.cards.len().min(15),
        ));
        ui.add_space(10.0);
        if deck.cards.is_empty() && deck.side.is_empty() {
            ui.label("Колода пока пуста. Нажмите «Карты», чтобы выбрать карты из каталога.");
            return;
        }
        // All artwork still uses the bounded image cache and visible-only GPU path.
        egui::ScrollArea::vertical()
            .id_salt(("deck-overview", &deck.id))
            .show(ui, |ui| {
                self.deck_gallery(ui, &deck.cards, false);
                if !deck.side.is_empty() {
                    ui.add_space(12.0);
                    ui.separator();
                    ui.heading(format!("Запас · {}", deck.side.len()));
                    ui.add_space(8.0);
                    self.deck_gallery(ui, &deck.side, true);
                }
            });
    }

    fn deck_gallery(&mut self, ui: &mut egui::Ui, ids: &[String], side: bool) {
        let cards: Vec<_> = deck_widgets::sorted_cards(ids, &self.cat)
            .into_iter()
            .map(|(card, count)| (card.clone(), count))
            .collect();
        let columns = (ui.available_width() / 205.0).floor().max(1.0) as usize;
        let width = ((ui.available_width() - 18.0 * (columns - 1) as f32 - 8.0) / columns as f32)
            .clamp(40.0, 240.0);
        for row in cards.chunks(columns) {
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 18.0;
                for (card, count) in row {
                    ui.push_id((side, &card.id), |ui| {
                        ui.vertical(|ui| {
                            ui.set_width(width);
                            ui.spacing_mut().item_spacing.y = 6.0;
                            if !side {
                                let chances = (1..=(*count).min(4))
                                    .map(|n| format!("{n}+: {:.0}%", draw_chance(ids.len(), *count, n) * 100.0))
                                    .collect::<Vec<_>>().join(" · ");
                                ui.add(egui::Label::new(
                                    RichText::new(&chances).size(12.0).color(skin::INK),
                                ).truncate()).on_hover_text(format!(
                                    "Вероятность получить указанное число копий или больше в первой раздаче: {chances}"
                                ));
                            }
                            ui.add_space(10.0);
                            self.card_image(ui, card, width);
                            ui.add_space(4.0);
                            ui.horizontal(|ui| {
                                ui.strong(format!("×{count}"));
                                if ui.add(egui::Label::new(
                                    skin::heading(&card.name, 16.0),
                                ).truncate().sense(egui::Sense::click()))
                                    .on_hover_text(&card.name).clicked()
                                {
                                    self.detail = Some(card.id.clone());
                                }
                            });
                            ui.add(egui::Label::new(
                                format!("{} · №{}", self.cat.set_name(card.set_id), card.number),
                            ).truncate()).on_hover_text(self.cat.edition_name(card));
                            ui.add_space(14.0);
                        });
                    });
                }
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::draw_chance;

    #[test]
    fn opening_hand_chances_cover_repeated_cards_and_incomplete_decks() {
        assert!((draw_chance(30, 1, 1) - 0.5).abs() < 1e-12);
        assert!((draw_chance(30, 3, 1) - (1.0 - 455.0 / 4060.0)).abs() < 1e-12);
        assert!((draw_chance(30, 3, 2) - 0.5).abs() < 1e-12);
        assert!((draw_chance(30, 3, 3) - 455.0 / 4060.0).abs() < 1e-12);
        assert_eq!(draw_chance(7, 3, 3), 1.0);
        assert_eq!(draw_chance(7, 3, 4), 0.0);
        assert_eq!(draw_chance(0, 0, 1), 0.0);
        assert!((draw_chance(10_000, 1, 1) - 0.0015).abs() < 1e-12);
    }
}

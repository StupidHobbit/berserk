use super::*;
use crate::formats;

pub(super) struct DeckFile {
    pub(super) path: PathBuf,
    pub(super) preview: Result<DeckPreview, String>,
}
pub(super) struct DeckPreview {
    deck: Deck,
    main: Stats,
    side: Stats,
}
impl DeckFile {
    pub(super) fn parse(path: PathBuf, text: &str, cat: &Catalog) -> Self {
        let preview = (|| {
            let (mut user, _) = transfer::import(
                TransferKind::Deck,
                text.trim_start_matches('\u{feff}'),
                true,
                &UserData::default(),
                cat,
            )?;
            let mut deck = user.decks.remove(0);
            deck.name = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            if deck.name.trim().is_empty() {
                return Err("У файла нет названия колоды".into());
            }
            Ok(DeckPreview {
                main: Stats::of(&deck.cards, cat),
                side: Stats::of(&deck.side, cat),
                deck,
            })
        })();
        Self { path, preview }
    }
}

pub(super) fn read_files(paths: Vec<PathBuf>, cat: &Catalog) -> Vec<DeckFile> {
    paths
        .into_iter()
        .map(|path| match storage::read_import(&path) {
            Ok(text) => DeckFile::parse(path, &text, cat),
            Err(error) => DeckFile {
                path,
                preview: Err(error),
            },
        })
        .collect()
}

fn import_batch(
    files: &[DeckFile],
    user: &UserData,
    cat: &Catalog,
) -> Result<(UserData, String), String> {
    if files.is_empty() {
        return Err("Выберите файлы колод".into());
    }
    let mut decks = Vec::with_capacity(files.len());
    for file in files {
        let preview = file.preview.as_ref().map_err(|e| {
            format!(
                "{}: {e}",
                file.path.file_name().unwrap_or_default().to_string_lossy()
            )
        })?;
        decks.push(preview.deck.clone());
    }
    let active = decks[0].id.clone();
    let mut next = user.clone();
    decks.append(&mut next.decks);
    next.decks = decks;
    next.validate(cat)?;
    Ok((next, active))
}

impl NativeApp {
    pub(super) fn apply_deck_import(&mut self, transfer: &mut Transfer) -> bool {
        if self.pending.is_some() || self.storage_error.is_some() {
            transfer.error =
                "Импорт недоступен: дождитесь сохранения или восстановите резервную копию.".into();
            return false;
        }
        match import_batch(&transfer.decks, &self.user, &self.cat) {
            Ok((next, active)) => {
                self.submit(next, None, Some(active), false);
                true
            }
            Err(error) => {
                transfer.error = error;
                false
            }
        }
    }

    pub(super) fn deck_import_window(&mut self, ctx: &egui::Context, mut transfer: Transfer) {
        let mut open = true;
        let mut cancel = false;
        let mut applied = false;
        let busy = self.file_result.is_some() || self.pending.is_some();
        let body_height = (ctx.content_rect().height() - 290.0).clamp(120.0, 440.0);
        egui::Window::new("Импорт колод")
            .id(egui::Id::new("deck-import"))
            .open(&mut open).collapsible(false).resizable(false)
            .default_width(560.0)
            .max_width((ctx.content_rect().width() - 64.0).max(360.0))
            .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
            .frame(egui::Frame::window(&ctx.style_of(egui::Theme::Dark)).inner_margin(18))
            .show(ctx, |ui| {
                ui.label("Один файл — одна колода. Название берётся из имени файла.");
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    if ui.add_enabled(!busy, egui::Button::new(if transfer.decks.is_empty() { "Выбрать файлы…" } else { "Добавить файлы…" })).clicked() {
                        let cat = self.cat.clone();
                        let request = transfer.id.clone();
                        self.file_task(ctx, move || {
                            // Keep renamed files selectable, just like backup restore.
                            let Some(paths) = rfd::FileDialog::new().set_title("Выберите одну или несколько колод").pick_files() else { return Ok(None); };
                            Ok(Some(transfer::FileResult::Decks { request, files: read_files(paths, &cat) }))
                        });
                    }
                    if !transfer.decks.is_empty() { ui.label(format!("Файлов: {}", transfer.decks.len())); }
                    if busy { ui.spinner(); }
                });
                ui.add_space(10.0);
                let mut remove = None;
                if transfer.decks.is_empty() {
                    ui.label("Деклисты .brsd и .txt, компактные коды и Tabletop Simulator .json.");
                    ui.add_space(8.0);
                    ui.weak("После выбора файлов здесь появится количество карт каждой стихии.");
                } else {
                    let text_height = ui.text_style_height(&egui::TextStyle::Body);
                    let row_height = 24.0 + ui.spacing().interact_size.y.max(text_height)
                        + 3.0 * ui.spacing().item_spacing.y + 4.0 * text_height + 12.0;
                    egui::ScrollArea::vertical().id_salt("deck-import-files")
                        .max_height(body_height).auto_shrink([false, true])
                        .show_rows(ui, row_height, transfer.decks.len(), |ui, rows| {
                            for index in rows {
                                let file = &transfer.decks[index];
                                ui.push_id(index, |ui| {
                                    ui.allocate_ui(egui::vec2(ui.available_width(), row_height), |ui| {
                                        egui::Frame::new().fill(egui::Color32::from_rgb(25, 32, 27)).corner_radius(6).inner_margin(12).show(ui, |ui| {
                                            ui.set_width(ui.available_width());
                                            ui.horizontal(|ui| {
                                                let name = file.preview.as_ref().map(|p| p.deck.name.as_str()).unwrap_or_else(|_| file.path.file_name().and_then(|n| n.to_str()).unwrap_or("Файл"));
                                                ui.add_sized([ui.available_width() - 85.0, ui.spacing().interact_size.y], egui::Label::new(egui::RichText::new(name).strong()).halign(egui::Align::Min).truncate()).on_hover_text(file.path.file_name().unwrap_or_default().to_string_lossy());
                                                if ui.add_enabled(!busy, egui::Button::new("Убрать")).clicked() { remove = Some(index); }
                                            });
                                            match &file.preview {
                                                Ok(preview) => {
                                                    ui.label(format!("В колоде: {} · В запасе: {}", preview.main.total, preview.side.total));
                                                    ui.add_space(6.0);
                                                    egui::Grid::new("elements").num_columns(7).min_row_height(text_height).min_col_width(0.0).spacing(egui::vec2(12.0, 3.0)).show(ui, |ui| {
                                                        ui.label("");
                                                        for element in [1, 2, 4, 8, 16, 32] { ui.weak(self.cat.color_name(element)); }
                                                        ui.end_row();
                                                        for (label, stats) in [("Колода", &preview.main), ("Запас", &preview.side)] {
                                                            ui.label(label);
                                                            for element in [1, 2, 4, 8, 16, 32] {
                                                                ui.strong(stats.colors.get(&element).unwrap_or(&0).to_string());
                                                            }
                                                            ui.end_row();
                                                        }
                                                    });
                                                }
                                                Err(error) => {
                                                    egui::ScrollArea::vertical().max_height(text_height * 3.0 + 6.0).show(ui, |ui| {
                                                        ui.colored_label(egui::Color32::LIGHT_RED, error);
                                                    });
                                                }
                                            }
                                        });
                                    });
                                });
                            }
                        });
                }
                if let Some(index) = remove { transfer.decks.remove(index); transfer.error.clear(); }
                ui.add_space(8.0);
                ui.separator();
                let invalid = transfer.decks.iter().filter(|file| file.preview.is_err()).count();
                if invalid > 0 { ui.colored_label(egui::Color32::LIGHT_RED, format!("Не удалось прочитать файлов: {invalid}. Уберите их или выберите исправленные.")); }
                else { ui.small("Колоды будут добавлены к сохранённым. Совпадающие названия не заменяют существующие колоды."); }
                if !transfer.error.is_empty() {
                    egui::ScrollArea::vertical().id_salt("deck-import-error").max_height(48.0).show(ui, |ui| { ui.colored_label(egui::Color32::LIGHT_RED, &transfer.error); });
                }
                if self.storage_error.is_some() { ui.colored_label(egui::Color32::LIGHT_RED, "Сначала восстановите данные из резервной копии."); }
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    let enabled = !busy && self.storage_error.is_none() && !transfer.decks.is_empty() && invalid == 0;
                    if ui.add_enabled(enabled, egui::Button::new(egui::RichText::new(format!("Импортировать ({})", transfer.decks.len())).strong().color(skin::INK)).fill(skin::GOLD).min_size(egui::vec2(190.0, 38.0))).clicked() {
                        applied = self.apply_deck_import(&mut transfer);
                    }
                    if ui.add_sized([100.0, 38.0], egui::Button::new("Отмена")).clicked() { cancel = true; }
                });
            });
        if open && !cancel && !applied {
            self.transfer = Some(transfer);
        }
    }

    pub(super) fn deck_export_menu(&mut self, ui: &mut egui::Ui, deck: &Deck) {
        let busy = self.file_result.is_some();
        ui.add_enabled_ui(!busy, |ui| {
            for (label, extension, names) in [
                ("Деклист .txt", "txt", true),
                ("По ID .brsd", "brsd", false),
            ] {
                if ui.button(label).clicked() {
                    self.export(
                        &format!("deck.{extension}"),
                        formats::write_deck(deck, &self.cat, names),
                        ui.ctx(),
                    );
                    ui.close();
                }
            }
            if ui.button("Копировать компактный код").clicked() {
                ui.ctx().copy_text(formats::write_compact(deck, &self.cat));
                self.status = "Код колоды скопирован".into();
                ui.close();
            }
            if ui.button("Tabletop Simulator .json").clicked() {
                match formats::write_tts(deck, &self.cat) {
                    Ok(text) => self.export("deck-tts.json", text, ui.ctx()),
                    Err(error) => self.status = error,
                }
                ui.close();
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_override_embedded_names_and_statistics_count_all_copies() {
        let cat = Catalog::load().unwrap();
        let mut deck = Deck::new("original".into(), "Embedded title".into());
        deck.description = "Keep these notes".into();
        deck.allowed_sets = Some(cat.set_ids());
        for element in [1, 2, 4, 8, 16, 32] {
            let card = cat
                .cards
                .iter()
                .find(|c| c.color == element && c.alt.is_empty())
                .unwrap();
            for _ in 0..3 {
                deck.add(&card.id, false);
            }
            deck.add(&card.id, true);
        }
        for (name, text, notes) in [
            (
                "Леса.v2.brsd",
                formats::write_deck(&deck, &cat, false),
                true,
            ),
            ("Имена.txt", formats::write_deck(&deck, &cat, true), true),
            ("Код.txt", formats::write_compact(&deck, &cat), false),
            (
                "Колода TTS.json",
                formats::write_tts(&deck, &cat).unwrap(),
                true,
            ),
        ] {
            let file = DeckFile::parse(PathBuf::from(name), &format!("\u{feff}{text}"), &cat);
            let preview = file.preview.unwrap();
            assert_eq!(
                preview.deck.name,
                PathBuf::from(name).file_stem().unwrap().to_str().unwrap()
            );
            assert_ne!(preview.deck.id, deck.id);
            assert_eq!(preview.main.total, 18);
            assert_eq!(preview.side.total, 6);
            for element in [1, 2, 4, 8, 16, 32] {
                assert_eq!(preview.main.colors[&element], 3);
                assert_eq!(preview.side.colors[&element], 1);
            }
            if notes {
                assert_eq!(preview.deck.description, deck.description);
                assert_eq!(preview.deck.allowed_sets, deck.allowed_sets);
            }
        }
    }

    #[test]
    fn batch_preserves_existing_data_and_rejects_invalid_files_as_one_transaction() {
        let cat = Catalog::load().unwrap();
        let root = tempfile::tempdir().unwrap();
        let paths: Vec<_> = ["Одна.brsd", "Вторая.txt", "Ошибка.brsd"]
            .iter()
            .map(|name| root.path().join(name))
            .collect();
        std::fs::write(&paths[0], format!("2 {}", cat.cards[0].id)).unwrap();
        std::fs::write(&paths[1], format!("1 {}", cat.cards[1].id)).unwrap();
        std::fs::write(&paths[2], "1 nonexistent-card").unwrap();
        let mut files = read_files(paths, &cat);
        let mut user = UserData::default();
        user.set_count(&cat.cards[0].id, 7);
        user.favorites.insert(cat.cards[0].id.clone());
        user.decks.push(Deck::new("existing".into(), "Одна".into()));
        assert!(import_batch(&files, &user, &cat).is_err());
        assert!(import_batch(&[], &user, &cat).is_err());
        assert_eq!(user.decks.len(), 1);
        files.pop();
        let (next, active) = import_batch(&files, &user, &cat).unwrap();
        assert_eq!(
            next.decks
                .iter()
                .map(|d| d.name.as_str())
                .collect::<Vec<_>>(),
            ["Одна", "Вторая", "Одна"]
        );
        assert_eq!(next.decks[2], user.decks[0]);
        assert_eq!(active, next.decks[0].id);
        assert_eq!(next.collection, user.collection);
        assert_eq!(next.favorites, user.favorites);
        assert_ne!(next.decks[0].id, next.decks[1].id);
        assert!(
            read_files(vec![root.path().join("missing.txt")], &cat)[0]
                .preview
                .is_err()
        );
    }
}

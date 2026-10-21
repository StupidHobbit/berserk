use super::*;
use crate::formats;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum FileAction {
    Import,
    RestoreBackup,
    OpenCollection,
}
pub(super) struct ImportedFile {
    pub(super) text: String,
    pub(super) name: String,
    pub(super) action: FileAction,
}

pub(super) enum FileResult {
    Single(ImportedFile),
    Decks {
        request: String,
        files: Vec<deck_import::DeckFile>,
    },
}

// Extensions vary between exports. Detect and validate the contents instead.
pub(super) fn restore_kind(text: &str, cat: &Catalog) -> Result<TransferKind, String> {
    let text = text.trim_start_matches('\u{feff}').trim();
    if text.starts_with('{') {
        let value: serde_json::Value =
            serde_json::from_str(text).map_err(|e| format!("Неверная резервная копия: {e}"))?;
        if !value
            .get("collection")
            .is_some_and(serde_json::Value::is_object)
            || !value.get("decks").is_some_and(serde_json::Value::is_array)
        {
            return Err("Этот JSON не является резервной копией Berserk. Выберите файл резервной копии или коллекцию .brsc.".into());
        }
        import(TransferKind::Backup, text, false, &UserData::default(), cat)?;
        Ok(TransferKind::Backup)
    } else {
        CollectionStatistics::parse(text, cat)
            .map_err(|e| format!("Не удалось прочитать коллекцию: {e}"))?;
        Ok(TransferKind::Collection)
    }
}
pub(super) struct CollectionStatistics {
    total: u64,
    rarities: std::collections::BTreeMap<u8, u64>,
    sets: usize,
}
impl CollectionStatistics {
    fn parse(text: &str, cat: &Catalog) -> Result<Self, String> {
        if text.len() as u64 > storage::MAX_IMPORT_BYTES {
            return Err("Файл превышает 10 МБ".into());
        }
        let entries = formats::read_collection(text, cat)?;
        let mut rarities: std::collections::BTreeMap<u8, u64> = cat
            .constants
            .rarities
            .keys()
            .filter_map(|id| id.parse().ok().map(|id| (id, 0)))
            .collect();
        let mut sets = BTreeSet::new();
        let mut total = 0;
        for (id, entry) in entries {
            let count = u64::from(*entry.count.get("").unwrap_or(&0));
            if count == 0 {
                continue;
            }
            if let Some(card) = cat.get(&id) {
                *rarities.entry(card.rarity).or_default() += count;
                sets.insert(card.set_id);
                total += count;
            }
        }
        Ok(Self {
            total,
            rarities,
            sets: sets.len(),
        })
    }
}
impl Transfer {
    pub(super) fn refresh_statistics(&mut self, cat: &Catalog) {
        self.confirm = false;
        self.error.clear();
        self.statistics = (self.kind == TransferKind::Collection && !self.text.trim().is_empty())
            .then(|| CollectionStatistics::parse(&self.text, cat));
    }
}

pub(super) fn import(
    kind: TransferKind,
    text: &str,
    merge: bool,
    user: &UserData,
    cat: &Catalog,
) -> Result<(UserData, Option<String>), String> {
    if text.len() as u64 > storage::MAX_IMPORT_BYTES {
        return Err("Файл превышает 10 МБ".into());
    }
    if text.trim().is_empty() {
        return Err("Выберите файл или вставьте текст".into());
    }
    let mut next = user.clone();
    let mut active = None;
    match kind {
        TransferKind::Backup => {
            next = serde_json::from_str(text).map_err(|e| format!("Неверный JSON: {e}"))?;
            active = next.decks.first().map(|d| d.id.clone());
        }
        TransferKind::Collection => {
            let collection = formats::read_collection(text, cat)?;
            if merge {
                for (id, entry) in collection {
                    let target = next.collection.entry(id).or_default();
                    for (key, n) in entry.count {
                        let count = target.count.entry(key).or_default();
                        *count = count.checked_add(n).ok_or("Количество слишком велико")?;
                    }
                    target.costs.extend(entry.costs);
                }
            } else {
                next.collection = collection;
            }
        }
        TransferKind::Deck => {
            let text = text.trim();
            let deck = if text.starts_with('{') {
                formats::read_tts(text, cat, NativeApp::id())?
            } else if text.starts_with('#') && !text.contains(char::is_whitespace) {
                formats::read_compact(text, cat, NativeApp::id())?
            } else {
                formats::read_deck(text, cat, NativeApp::id())?
            };
            active = Some(deck.id.clone());
            next.decks.insert(0, deck);
        }
    }
    next.validate(cat)?;
    Ok((next, active))
}
impl NativeApp {
    pub(super) fn open_transfer(&mut self, kind: TransferKind) {
        self.transfer = Some(Transfer {
            kind,
            id: Self::id(),
            decks: Vec::new(),
            text: String::new(),
            merge: true,
            confirm: false,
            error: String::new(),
            source: None,
            statistics: None,
        });
    }
    fn file_job(
        &mut self,
        ctx: &egui::Context,
        job: impl FnOnce() -> Result<Option<ImportedFile>, String> + Send + 'static,
    ) {
        self.file_task(ctx, move || job().map(|file| file.map(FileResult::Single)));
    }
    pub(super) fn file_task(
        &mut self,
        ctx: &egui::Context,
        job: impl FnOnce() -> Result<Option<FileResult>, String> + Send + 'static,
    ) {
        if self.file_result.is_some() {
            return;
        }
        let (tx, rx) = mpsc::channel();
        let ctx = ctx.clone();
        self.file_result = Some(rx);
        std::thread::spawn(move || {
            let _ = tx.send(job());
            ctx.request_repaint();
        });
    }
    pub(super) fn poll_file(&mut self) {
        let result = self.file_result.as_ref().and_then(|rx| rx.try_recv().ok());
        if let Some(result) = result {
            self.file_result = None;
            match result {
                Ok(Some(FileResult::Decks { request, files })) => {
                    if let Some(transfer) = &mut self.transfer
                        && transfer.kind == TransferKind::Deck
                        && transfer.id == request
                    {
                        for file in files {
                            // Re-selecting a file refreshes its preview, never duplicates it.
                            if let Some(old) =
                                transfer.decks.iter_mut().find(|old| old.path == file.path)
                            {
                                *old = file;
                            } else {
                                transfer.decks.push(file);
                            }
                        }
                        transfer.error.clear();
                    }
                }
                Ok(Some(FileResult::Single(file))) => {
                    if let Some(mut transfer) = self.transfer.take() {
                        if file.action != FileAction::Import
                            && transfer.kind != TransferKind::Backup
                        {
                            self.transfer = Some(transfer);
                            return;
                        }
                        transfer.text = file.text;
                        transfer.source = Some(file.name);
                        if file.action == FileAction::OpenCollection {
                            transfer.kind = TransferKind::Collection;
                            transfer.merge = true;
                        }
                        transfer.refresh_statistics(&self.cat);
                        if file.action != FileAction::RestoreBackup
                            || !self.apply_transfer(&mut transfer)
                        {
                            self.transfer = Some(transfer);
                        }
                    }
                }
                Ok(None) => self.status = "Операция завершена".into(),
                Err(e) => {
                    if let Some(transfer) = &mut self.transfer {
                        transfer.error = e.clone();
                    }
                    self.status = e;
                }
            }
        }
    }
    pub(super) fn export(&mut self, name: &str, text: String, ctx: &egui::Context) {
        let name = name.to_string();
        self.file_job(ctx, move || {
            if let Some(path) = rfd::FileDialog::new().set_file_name(name).save_file() {
                storage::atomic_write(&path, text.as_bytes())?;
            }
            Ok(None)
        });
    }
    pub(super) fn transfer_window(&mut self, ctx: &egui::Context) {
        let Some(transfer) = self.transfer.take() else {
            return;
        };
        if transfer.kind == TransferKind::Collection {
            self.collection_transfer(ctx, transfer);
            return;
        }
        if transfer.kind == TransferKind::Backup {
            self.backup_window(ctx, transfer);
            return;
        }
        self.deck_import_window(ctx, transfer);
    }
    fn apply_transfer(&mut self, transfer: &mut Transfer) -> bool {
        if self.pending.is_some() {
            transfer.error = "Дождитесь завершения сохранения и повторите восстановление.".into();
            return false;
        }
        match import(
            transfer.kind,
            &transfer.text,
            transfer.merge,
            &self.user,
            &self.cat,
        ) {
            Ok((next, active)) => {
                // Preserve a corrupt source before an explicitly requested restore.
                if self.storage_error.is_some() {
                    let source = self.store.path.clone();
                    let backup = source.with_file_name(format!("unreadable-{}.json", Self::id()));
                    if let Err(e) = std::fs::copy(&source, &backup) {
                        transfer.error = format!("Не удалось сохранить исходный файл: {e}");
                        return false;
                    }
                    self.storage_error = None;
                }
                self.submit(next, None, active, false);
                if transfer.kind == TransferKind::Collection {
                    self.page = Page::Collection;
                    self.dirty = true;
                }
                true
            }
            Err(e) => {
                transfer.error = e;
                false
            }
        }
    }
    fn backup_window(&mut self, ctx: &egui::Context, mut transfer: Transfer) {
        let mut open = true;
        let busy = self.file_result.is_some() || self.pending.is_some();
        egui::Window::new("Мои данные")
            .id(egui::Id::new("backup-actions"))
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .default_width(420.0)
            .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
            .frame(egui::Frame::window(&ctx.style_of(egui::Theme::Dark)).inner_margin(18))
            .show(ctx, |ui| {
                ui.label("Коллекция, колоды, избранное и заметки — в одном файле.");
                ui.add_space(12.0);
                let size = egui::vec2(ui.available_width(), 42.0);
                if ui.add_enabled(!busy && self.storage_error.is_none(),
                    egui::Button::new("Сохранить резервную копию").min_size(size)).clicked() {
                    transfer.error.clear();
                    self.export("berserk-backup.json", serde_json::to_string_pretty(&self.user).unwrap(), ctx);
                }
                if ui.add_enabled(!busy,
                    egui::Button::new("Восстановить из файла…").min_size(size)).clicked() {
                    transfer.error.clear();
                    let cat = self.cat.clone();
                    self.file_job(ctx, move || {
                        let Some(path) = rfd::FileDialog::new()
                            .set_title("Выберите резервную копию или коллекцию")
                            .pick_file() else { return Ok(None); };
                        let text = storage::read_import(&path)?.trim_start_matches('\u{feff}').to_owned();
                        let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
                        if restore_kind(&text, &cat)? == TransferKind::Collection {
                            return Ok(Some(ImportedFile { text, name, action: FileAction::OpenCollection }));
                        }
                        // Validate before offering to replace any saved data.
                        let (user, _) = import(TransferKind::Backup, &text, false, &UserData::default(), &cat)?;
                        let result = rfd::MessageDialog::new()
                            .set_title("Восстановить резервную копию?")
                            .set_description(format!("{name}\n\nКарт: {} · Колод: {} · Избранных: {}\n\nТекущие данные будут заменены содержимым этой копии.", user.total(), user.decks.len(), user.favorites.len()))
                            .set_buttons(rfd::MessageButtons::OkCancel)
                            .show();
                        Ok((result == rfd::MessageDialogResult::Ok).then_some(ImportedFile {
                            text, name, action: FileAction::RestoreBackup,
                        }))
                    });
                }
                if busy {
                    ui.horizontal(|ui| { ui.spinner(); ui.label("Подождите, операция выполняется…"); });
                }
                if !transfer.error.is_empty() {
                    egui::ScrollArea::vertical().max_height(90.0).show(ui, |ui| {
                        ui.colored_label(egui::Color32::LIGHT_RED, &transfer.error);
                    });
                }
            });
        if open {
            self.transfer = Some(transfer);
        }
    }
    fn collection_transfer(&mut self, ctx: &egui::Context, mut transfer: Transfer) {
        let mut open = true;
        let mut applied = false;
        let mut cancel = false;
        let busy = self.file_result.is_some() || self.pending.is_some();
        // Keep the mode selector and action row outside the scrolling content.
        let body_height = (ctx.content_rect().height() - 400.0).clamp(90.0, 240.0);
        egui::Window::new("Импорт коллекции")
            .id(egui::Id::new("collection-import"))
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .default_width(540.0)
            .max_width((ctx.content_rect().width() - 64.0).max(360.0))
            .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
            .frame(egui::Frame::window(&ctx.style_of(egui::Theme::Dark)).inner_margin(18))
            .show(ctx, |ui| {
                ui.label("Выберите файл коллекции .brsc.");
                ui.add_space(6.0);
                ui.add_enabled_ui(!busy, |ui| {
                    ui.horizontal_wrapped(|ui| {
                        if ui.button(if transfer.text.is_empty() { "Выбрать файл…" } else { "Другой файл…" }).clicked() {
                            self.file_job(ctx, || {
                                rfd::FileDialog::new()
                                    .add_filter("Коллекция Berserk", &["brsc", "brs", "txt"])
                                    .pick_file()
                                    .map(|p| storage::read_import(&p).map(|text| Some(ImportedFile {
                                        text,
                                        action: FileAction::Import,
                                        name: p.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                                    })))
                                    .unwrap_or(Ok(None))
                            });
                        }
                        if let Some(source) = &transfer.source {
                            ui.add(egui::Label::new(source).truncate()).on_hover_text(source);
                        }
                    });
                });
                if busy {
                    ui.horizontal(|ui| { ui.spinner(); ui.label("Подождите, файл обрабатывается…"); });
                }
                ui.add_space(8.0);
                egui::ScrollArea::vertical()
                    .id_salt("collection-import-body")
                    .max_height(body_height)
                    .auto_shrink([false, true])
                    .show(ui, |ui| {
                        if let Some(statistics) = &transfer.statistics {
                            match statistics {
                                Ok(statistics) => {
                                    ui.horizontal(|ui| {
                                        ui.strong(format!("Всего карт: {}", statistics.total));
                                        ui.separator();
                                        ui.strong(format!("Наборов: {}", statistics.sets));
                                    });
                                    ui.add_space(10.0);
                                    egui::Grid::new("collection-import-rarities")
                                        .num_columns(2).min_col_width(170.0)
                                        .spacing(egui::vec2(24.0, 6.0))
                                        .show(ui, |ui| {
                                            for (rarity, count) in &statistics.rarities {
                                                let name = self.cat.rarity_name(*rarity);
                                                ui.label(if name.is_empty() { "Другая редкость".into() } else { name });
                                                ui.strong(count.to_string());
                                                ui.end_row();
                                            }
                                        });
                                }
                                Err(error) => { ui.colored_label(egui::Color32::LIGHT_RED, error); }
                            }
                        } else {
                            ui.label("После выбора файла здесь появятся количество карт по редкости и число наборов.");
                        }
                        if !transfer.error.is_empty() {
                            ui.colored_label(egui::Color32::LIGHT_RED, &transfer.error);
                        }
                    });
                ui.add_space(8.0);
                ui.separator();
                ui.add_enabled_ui(!busy, |ui| {
                    ui.horizontal_wrapped(|ui| {
                        let changed = ui.radio_value(&mut transfer.merge, true, "Добавить к коллекции").changed();
                        let changed = ui.radio_value(&mut transfer.merge, false, "Заменить коллекцию").changed() || changed;
                        if changed { transfer.confirm = false; transfer.error.clear(); }
                    });
                    let total = transfer.statistics.as_ref().and_then(|p| p.as_ref().ok()).map(|p| p.total);
                    if transfer.merge {
                        ui.small(if let Some(total) = total {
                            format!("Сейчас: {} карт. После добавления: {}. Количества совпадающих карт суммируются.", self.user.total(), self.user.total() + total)
                        } else { "Карты из файла будут добавлены к текущим. Количества суммируются.".into() });
                    } else {
                        ui.small(format!("Текущая коллекция ({} карт) будет заменена. Колоды и избранное сохранятся.", self.user.total()));
                        ui.checkbox(&mut transfer.confirm, "Подтверждаю замену коллекции");
                    }
                    ui.add_space(10.0);
                    ui.horizontal(|ui| {
                        let enabled = total.is_some() && (transfer.merge || transfer.confirm);
                        if ui.add_enabled(enabled, egui::Button::new(egui::RichText::new("Импортировать").strong().color(skin::INK))
                            .fill(skin::GOLD).min_size(egui::vec2(170.0, 38.0))).clicked() {
                            applied = self.apply_transfer(&mut transfer);
                        }
                        if ui.add_sized([100.0, 38.0], egui::Button::new("Отмена")).clicked() { cancel = true; }
                    });
                });
            });
        if open && !cancel && !applied {
            self.transfer = Some(transfer);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restore_detects_collection_exports_and_validates_backup_shape() {
        let cat = Catalog::load().unwrap();
        let collection = include_str!("../../tests/fixtures/upstream-collection.brsc");
        assert!(restore_kind(collection, &cat).unwrap() == TransferKind::Collection);
        assert!(
            restore_kind(&format!("\u{feff}{collection}"), &cat).unwrap()
                == TransferKind::Collection
        );
        let backup = serde_json::to_string(&UserData::default()).unwrap();
        assert!(restore_kind(&backup, &cat).unwrap() == TransferKind::Backup);
        assert!(restore_kind(&format!("\u{feff}{backup}"), &cat).unwrap() == TransferKind::Backup);
        for invalid in [
            "",
            "{}",
            "{broken",
            r#"{"ObjectStates":[]}"#,
            r#"{"version":2,"collection":{},"decks":[]}"#,
            "not-a-card 3",
        ] {
            assert!(
                restore_kind(invalid, &cat).is_err(),
                "must reject {invalid}"
            );
        }
    }
    #[test]
    fn collection_statistics_count_copies_by_rarity_and_ignore_zero_count_sets() {
        let cat = Catalog::load().unwrap();
        let base = &cat.cards.iter().find(|c| !c.is_foil()).unwrap().id;
        let foil = &cat.cards.iter().find(|c| c.is_foil()).unwrap().id;
        let empty = cat
            .cards
            .iter()
            .find(|c| {
                c.set_id != cat.get(base).unwrap().set_id
                    && c.set_id != cat.get(foil).unwrap().set_id
            })
            .unwrap();
        let text = format!("{base} 2\n{base} 1\n{foil} 4\n{} 0", empty.id);
        let statistics = CollectionStatistics::parse(&text, &cat).unwrap();
        assert_eq!(statistics.total, 7);
        let represented: BTreeSet<_> = [base, foil]
            .iter()
            .map(|id| cat.get(id).unwrap().set_id)
            .collect();
        assert_eq!(statistics.sets, represented.len());
        for (rarity, count) in &statistics.rarities {
            let expected = if cat.get(base).unwrap().rarity == *rarity {
                3
            } else {
                0
            } + if cat.get(foil).unwrap().rarity == *rarity {
                4
            } else {
                0
            };
            assert_eq!(*count, expected);
        }
        assert_eq!(statistics.rarities.values().sum::<u64>(), statistics.total);
        let mut user = UserData::default();
        user.set_count(base, 5);
        user.favorites.insert(base.clone());
        user.decks.push(Deck::new("kept".into(), "Test".into()));
        let (added, _) = import(TransferKind::Collection, &text, true, &user, &cat).unwrap();
        assert_eq!(added.total(), user.total() + statistics.total);
        let (replaced, _) = import(TransferKind::Collection, &text, false, &user, &cat).unwrap();
        assert_eq!(replaced.total(), statistics.total);
        assert_eq!(replaced.decks, user.decks);
        assert_eq!(replaced.favorites, user.favorites);
        assert!(CollectionStatistics::parse("unknown-card 3", &cat).is_err());
        let empty = CollectionStatistics::parse(&format!("{base} 0"), &cat).unwrap();
        assert_eq!((empty.total, empty.sets), (0, 0));
        assert!(empty.rarities.values().all(|count| *count == 0));
    }
    #[test]
    fn collection_merge_overflow_is_transactional() {
        let cat = Catalog::load().unwrap();
        let id = &cat.cards[0].id;
        let mut user = UserData::default();
        user.set_count(id, u32::MAX);
        assert!(
            import(
                TransferKind::Collection,
                &format!("{id} 1"),
                true,
                &user,
                &cat
            )
            .is_err()
        );
        assert_eq!(user.count(id), u32::MAX);
    }
    #[test]
    fn all_transfer_formats_share_domain_parsers() {
        let cat = Catalog::load().unwrap();
        let mut user = UserData::default();
        user.set_count(&cat.cards[0].id, 3);
        user.favorites.insert(cat.cards[0].id.clone());
        user.legacy_draft = Some(serde_json::json!({"retained":true}));
        let (mut restored, _) = import(
            TransferKind::Backup,
            &serde_json::to_string(&user).unwrap(),
            false,
            &UserData::default(),
            &cat,
        )
        .unwrap();
        assert_eq!(restored, user);
        let text = format!(
            "# Test\n2 {}\n---side---\n1 {}",
            cat.cards[0].id, cat.cards[1].id
        );
        (restored, _) = import(TransferKind::Deck, &text, true, &restored, &cat).unwrap();
        assert_eq!(restored.decks[0].side.len(), 1);
        assert_eq!(restored.collection, user.collection);
    }
}

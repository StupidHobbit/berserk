use super::*;
use eframe::egui::{self, RichText};

fn combo(
    ui: &mut egui::Ui,
    label: &str,
    value: &mut String,
    options: impl IntoIterator<Item = (String, String)>,
) {
    let options: Vec<_> = options.into_iter().collect();
    let selected = options
        .iter()
        .find(|(v, _)| v == value)
        .map(|(_, n)| n.as_str())
        .unwrap_or("Все");
    ui.label(label);
    egui::ComboBox::from_id_salt(label)
        .selected_text(selected)
        .width(ui.available_width())
        .show_ui(ui, |ui| {
            ui.selectable_value(value, String::new(), "Все");
            for (v, n) in options {
                ui.selectable_value(value, v, n);
            }
        });
}
fn optional_number(ui: &mut egui::Ui, label: &str, number: &mut Option<u16>) {
    ui.horizontal(|ui| {
        let mut enabled = number.is_some();
        if ui.checkbox(&mut enabled, label).changed() {
            *number = enabled.then_some(0);
        }
        if let Some(n) = number {
            ui.add(egui::DragValue::new(n).range(0..=u16::MAX));
        }
    });
}
fn sets(ui: &mut egui::Ui, cat: &Catalog, selected: &mut Vec<u16>) {
    set_selector(ui, cat, selected, true);
}
fn set_selector(ui: &mut egui::Ui, cat: &Catalog, selected: &mut Vec<u16>, open: bool) {
    egui::CollapsingHeader::new(format!(
        "Разрешённые наборы ({}/{})",
        selected.len(),
        cat.constants.sets.len()
    ))
    .id_salt("allowed-sets-selector")
    .default_open(open)
    .show(ui, |ui| {
        ui.horizontal(|ui| {
            if ui.button("Все").clicked() {
                *selected = cat.set_ids();
            }
            if ui.button("Снять выбор").clicked() {
                selected.clear();
            }
        });
        for (id, name) in cat.constants.sets.iter().rev() {
            let id = id.parse::<u16>().unwrap();
            let mut checked = selected.contains(&id);
            if ui.checkbox(&mut checked, name).changed() {
                selected.retain(|n| *n != id);
                if checked {
                    selected.push(id);
                    selected.sort_unstable();
                }
            }
        }
    });
}
impl NativeApp {
    fn show_deck_library(&mut self) {
        if let Some((id, name)) = self.rename.clone()
            && !name.trim().is_empty()
            && self
                .deck()
                .is_some_and(|deck| deck.id == id && deck.name != name)
        {
            self.edit_deck(|deck| deck.name = name);
        }
        self.active = None;
        self.deck_full = false;
        self.hand = Hand::default();
    }

    pub(super) fn top(&mut self, root: &mut egui::Ui) {
        egui::Panel::top("header").frame(egui::Frame::new().inner_margin(egui::Margin::symmetric(22, 14))).show(root, |ui| {
            let compact = ui.available_width() < 1000.0;
            ui.horizontal_wrapped(|ui| {
                ui.add_space(4.0);
                ui.label(skin::heading("БЕРСЕРК", if compact {24.0}else{28.0}).color(skin::GOLD));
                ui.add_space(if compact {8.0}else{20.0});
                for (page,label) in [(Page::Catalog,"Энциклопедия"),(Page::Collection,"Моя коллекция"),(Page::Decks,"Мои колоды")] {
                    if skin::button(&self.skin, ui, label, egui::vec2(if compact {130.0}else{145.0}, 40.0), self.page == page || (page == Page::Decks && self.page == Page::CreateWithCodex)).clicked() { self.page = page; if page == Page::Decks { self.show_deck_library(); } self.page_number = 0; self.dirty = true; }
                }
                if !compact && ui.button("Мои данные").clicked() { self.open_transfer(TransferKind::Backup); }
                if !compact && ui.add_enabled(!self.undo.is_empty() && self.pending.is_none(), egui::Button::new("Отменить")).clicked() { self.undo(); }
                ui.menu_button(if compact { "Меню" } else { "Настройки" }, |ui| {
                    if compact {
                        if ui.button("Мои данные").clicked() { self.open_transfer(TransferKind::Backup); ui.close(); }
                        if ui.add_enabled(!self.undo.is_empty() && self.pending.is_none(),egui::Button::new("Отменить изменение")).clicked() { self.undo(); ui.close(); }
                        ui.separator();
                    }
                    ui.checkbox(&mut self.settings.effects, "Эффекты карт");
                    ui.checkbox(&mut self.settings.reduced, "Уменьшить движение");
                    ui.label("Анимация: до 30 кадров/с; остановка в фоне.");
                    ui.separator();
                    ui.label(format!("UI: {:.2} мс · поиск: {:.2} мс", self.frame_ms, self.search_ms));
                    ui.label(format!("Текстуры: {:.1} / 64 МиБ", self.images.bytes() as f64 / 1048576.0));
                    ui.label(format!("Хранилище: {}", self.store.path.display()));
                    ui.collapsing("Подключить внешний MCP", |ui| {
                        ui.label("Вставьте connect_url из connection_info"); ui.text_edit_singleline(&mut self.pair_url);
                        if ui.button("Подключить").clicked() && !self.pair_url.is_empty() { self.connect(ui.ctx(), Some(self.pair_url.clone())); }
                    });
                    for error in &self.effects.lock().unwrap().failures { ui.colored_label(egui::Color32::YELLOW, error); }
                });
            });
            if let Some(error) = &self.storage_error { ui.colored_label(egui::Color32::LIGHT_RED, error); ui.label("Редактирование заблокировано. Восстановите корректную копию через «Мои данные»."); }
        });
        egui::Panel::bottom("status").frame(egui::Frame::new().inner_margin(egui::Margin::symmetric(22, 5))).show(root, |ui| {
            ui.spacing_mut().interact_size.y=22.0;
            ui.spacing_mut().button_padding.y=2.0;
            ui.horizontal_wrapped(|ui| {
                if self.pending.is_some() { ui.small("Сохранение…"); }
                else if !self.status.is_empty() { ui.small(&self.status); if ui.small_button("×").on_hover_text("Скрыть сообщение").clicked() { self.status.clear(); } }
                else { ui.small("БЕРСЕРК  /  КОЛЛЕКЦИЯ"); }
                if self.startup_empty {
                    ui.separator();
                    if ui.small_button("Перенос данных").on_hover_text("Экспортируйте JSON в прежней версии и импортируйте его здесь. Старое хранилище сохранено.").clicked() { self.open_transfer(TransferKind::Backup); }
                    if ui.small_button("×").on_hover_text("Скрыть подсказку переноса").clicked() { self.startup_empty=false; }
                }
            });
        });
    }
    pub(super) fn filters(&mut self, ui: &mut egui::Ui) {
        let previous = self.filter.clone();
        egui::ScrollArea::vertical().show(ui, |ui| {
            ui.label(skin::heading("Отбор карт", 21.0).color(skin::GOLD));
            ui.small("Найдите место в своей колоде");
            ui.add_space(12.0);
            combo(
                ui,
                "Набор",
                &mut self.filter.set,
                self.cat
                    .constants
                    .sets
                    .iter()
                    .rev()
                    .map(|(k, v)| (k.clone(), v.clone())),
            );
            let mut color = if self.filter.color == 0 {
                String::new()
            } else {
                self.filter.color.to_string()
            };
            combo(
                ui,
                "Стихия",
                &mut color,
                self.cat
                    .constants
                    .colors
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone())),
            );
            self.filter.color = color.parse().unwrap_or(0);
            let mut rarity = if self.filter.rarity == 0 {
                String::new()
            } else {
                self.filter.rarity.to_string()
            };
            combo(
                ui,
                "Редкость",
                &mut rarity,
                self.cat
                    .constants
                    .rarities
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone())),
            );
            self.filter.rarity = rarity.parse().unwrap_or(0);
            ui.add_space(6.0);
            egui::CollapsingHeader::new("Характеристики").show(ui, |ui| {
                combo(
                    ui,
                    "Тип",
                    &mut self.filter.kind,
                    self.cat
                        .constants
                        .creature_types
                        .iter()
                        .map(|(k, v)| (k.clone(), v.clone())),
                );
                combo(
                    ui,
                    "Класс",
                    &mut self.filter.class,
                    self.classes.iter().map(|v| (v.clone(), v.clone())),
                );
                combo(
                    ui,
                    "Статус",
                    &mut self.filter.elite,
                    [
                        ("1".into(), "Элитная".into()),
                        ("0".into(), "Неэлитная".into()),
                    ],
                );
                optional_number(ui, "Цена от", &mut self.filter.min_cost);
                optional_number(ui, "Цена до", &mut self.filter.max_cost);
                optional_number(ui, "Здоровье от", &mut self.filter.min_life);
            });
            if self.page != Page::Collection {
                combo(
                    ui,
                    "В коллекции",
                    &mut self.filter.owned,
                    [
                        ("owned".into(), "Есть".into()),
                        ("missing".into(), "Нет".into()),
                    ],
                );
            }
            egui::CollapsingHeader::new("Варианты издания").show(ui, |ui| {
                ui.label("Издания");
                egui::ComboBox::from_id_salt("editions")
                    .selected_text(match self.filter.edition {
                        EditionFilter::All => "Все",
                        EditionFilter::Base => "Обычные",
                        EditionFilter::Foil => "Фойловые",
                        EditionFilter::Alternative => "Альтернативные",
                        EditionFilter::FullArt => "Полнoформатные",
                    })
                    .show_ui(ui, |ui| {
                        for (v, n) in [
                            (EditionFilter::All, "Все"),
                            (EditionFilter::Base, "Обычные"),
                            (EditionFilter::Foil, "Фойловые"),
                            (EditionFilter::Alternative, "Альтернативные"),
                            (EditionFilter::FullArt, "Полноформатные"),
                        ] {
                            ui.selectable_value(&mut self.filter.edition, v, n);
                        }
                    });
            });
            ui.add_space(8.0);
            ui.checkbox(&mut self.filter.favorites, "Только избранное");
            ui.checkbox(&mut self.filter.standard, "Без ротированных наборов");
            combo(
                ui,
                "Сортировка",
                &mut self.filter.sort,
                [
                    ("name", "Имя"),
                    ("cost", "Цена ↑"),
                    ("cost_desc", "Цена ↓"),
                    ("life", "Здоровье"),
                    ("rarity", "Редкость"),
                    ("color", "Стихия"),
                    ("rating", "Карапет"),
                    ("motd", "MotD"),
                ]
                .map(|(a, b)| (a.into(), b.into())),
            );
            if ui.button("Сбросить фильтры").clicked() {
                self.filter = Filter::default();
            }
        });
        if previous != self.filter {
            self.dirty = true;
            self.page_number = 0;
        }
    }
    pub(super) fn catalog(&mut self, ui: &mut egui::Ui) {
        let narrow = ui.available_width() < 640.0;
        let controls = |app: &mut Self, ui: &mut egui::Ui| {
            if ui
                .button("Импорт коллекции")
                .on_hover_text("Загрузить коллекцию из файла .brsc")
                .clicked()
            {
                app.open_transfer(TransferKind::Collection);
            }
            ui.checkbox(&mut app.settings.list, "Список");
            ui.toggle_value(&mut app.filters_open, "Фильтры");
        };
        ui.horizontal_wrapped(|ui| {
            ui.label(skin::heading(
                if self.page == Page::Collection {
                    "Моя коллекция"
                } else {
                    "Книга карт"
                },
                if narrow { 24.0 } else { 30.0 },
            ));
            if narrow {
                ui.menu_button("Вид / данные", |ui| controls(self, ui));
            } else {
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    controls(self, ui)
                });
            }
        });
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            let search = ui.add_sized(
                [ui.available_width().max(120.0), 36.0],
                egui::TextEdit::singleline(&mut self.filter.query)
                    .margin(egui::vec2(12.0, 9.0))
                    .hint_text("Поиск по имени, тексту, классу…     Ctrl / ⌘ F"),
            );
            if ui.input_mut(|i| i.consume_key(egui::Modifiers::COMMAND, egui::Key::F)) {
                search.request_focus();
            }
            if search.changed() {
                self.dirty = true;
                self.page_number = 0;
            }
        });
        self.refilter();
        ui.add_space(4.0);
        ui.horizontal_wrapped(|ui| {
            ui.label(
                RichText::new(if narrow {
                    format!("{} карт", self.filtered.len())
                } else {
                    format!(
                        "{} карт  ·  {} экземпляров в коллекции",
                        self.filtered.len(),
                        self.user.total()
                    )
                })
                .color(skin::MUTED),
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui
                    .add_enabled(
                        (self.page_number + 1) * 60 < self.filtered.len(),
                        egui::Button::new(if narrow { "›" } else { "Далее  ›" }),
                    )
                    .clicked()
                {
                    self.page_number += 1;
                }
                ui.label(format!(
                    "{} / {}",
                    self.page_number + 1,
                    self.filtered.len().div_ceil(60).max(1)
                ));
                if ui
                    .add_enabled(
                        self.page_number > 0,
                        egui::Button::new(if narrow { "‹" } else { "‹  Назад" }),
                    )
                    .clicked()
                {
                    self.page_number -= 1;
                }
            });
        });
        ui.add_space(14.0);
        if self.filtered.is_empty() {
            ui.add_space(50.0);
            ui.vertical_centered(|ui| {
                ui.label(skin::heading("Здесь пока нет карт", 26.0));
                ui.label("Измените поиск или сбросьте фильтры, чтобы открыть другие карты.");
                if ui.button("Сбросить фильтры").clicked() {
                    self.filter = Filter::default();
                    self.dirty = true;
                }
            });
        }
        let indices: Vec<_> = self
            .filtered
            .iter()
            .skip(self.page_number * 60)
            .take(60)
            .copied()
            .collect();
        let image_limit = ((ui.available_height() - 170.0) / 1.4167).clamp(90.0, 250.0);
        let max_card_width = image_limit.max(150.0);
        let columns = if self.settings.list {
            1
        } else {
            (ui.available_width() / (max_card_width.min(215.0) + 22.0))
                .floor()
                .max(1.0) as usize
        };
        let width = ((ui.available_width() - 22.0 * (columns - 1) as f32 - 12.0) / columns as f32)
            .min(max_card_width);
        let image_width = width.min(image_limit);
        let row_height = if self.settings.list {
            if ui.available_width() < 460.0 {
                if self.page == Page::Decks {
                    160.0
                } else {
                    122.0
                }
            } else {
                84.0
            }
        } else {
            image_width * 1.4167
                + if self.page == Page::Decks {
                    162.0
                } else {
                    124.0
                }
        };
        egui::ScrollArea::vertical()
            .id_salt(("catalog", self.page_number, self.settings.list))
            .show_rows(
                ui,
                row_height,
                indices.len().div_ceil(columns),
                |ui, rows| {
                    for row in rows {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 22.0;
                            for &index in indices.iter().skip(row * columns).take(columns) {
                                let card = self.cat.cards[index].clone();
                                ui.push_id(&card.id, |ui| {
                                    if self.settings.list {
                                        self.card_row(ui, &card);
                                    } else {
                                        ui.vertical(|ui| {
                                            ui.set_width(width);
                                            ui.spacing_mut().item_spacing = egui::vec2(6.0, 6.0);
                                            ui.add_space(20.0);
                                            ui.horizontal(|ui| {
                                                ui.add_space((width - image_width) * 0.5);
                                                self.card_image(ui, &card, image_width);
                                            });
                                            ui.add_space(4.0);
                                            ui.add(
                                                egui::Label::new(skin::heading(&card.name, 17.0))
                                                    .truncate(),
                                            );
                                            ui.add(
                                                egui::Label::new(format!(
                                                    "{} · {}",
                                                    self.cat.edition_name(&card),
                                                    card.cost
                                                ))
                                                .truncate(),
                                            );
                                            self.card_controls(ui, &card);
                                        });
                                    }
                                });
                            }
                        });
                    }
                },
            );
    }
    fn card_controls(&mut self, ui: &mut egui::Ui, card: &Card) {
        ui.vertical(|ui| {
            ui.spacing_mut().button_padding.x = 8.0;
            ui.spacing_mut().item_spacing.x = 6.0;
            ui.horizontal(|ui| {
                let favorite = self.user.favorites.contains(&card.id);
                if ui
                    .add_sized(
                        [32.0, 32.0],
                        egui::Button::new(if favorite { "★" } else { "☆" }),
                    )
                    .on_hover_text("Избранное")
                    .clicked()
                {
                    self.favorite(&card.id);
                }
                if ui
                    .add_enabled(
                        self.user.count(&card.id) > 0,
                        egui::Button::new("−").min_size(egui::vec2(32.0, 32.0)),
                    )
                    .on_hover_text("Убрать экземпляр из коллекции")
                    .clicked()
                {
                    self.own(&card.id, -1);
                }
                ui.add_sized(
                    [30.0, 32.0],
                    egui::Label::new(RichText::new(self.user.count(&card.id).to_string()).strong()),
                );
                let add = ui
                    .add_enabled(
                        self.user.count(&card.id) < u32::MAX,
                        egui::Button::new("+").min_size(egui::vec2(32.0, 32.0)),
                    )
                    .on_hover_text("Добавить экземпляр в коллекцию");
                if add.clicked() {
                    self.own(&card.id, 1);
                    if self.pending.is_some() {
                        self.burst = Some((Instant::now(), add.rect.center(), card.rarity));
                    }
                }
            });
            if self.page != Page::Decks {
                return;
            }
            let allowed = self.deck().is_none_or(|d| d.allows(card));
            let width = ui.available_width().clamp(115.0, 250.0);
            ui.add_enabled_ui(allowed, |ui| {
                if skin::button(
                    &self.skin,
                    ui,
                    "+  В колоду",
                    egui::vec2(width, 32.0),
                    false,
                )
                .clicked()
                {
                    self.add_card(&card.id);
                }
            })
            .response
            .on_hover_text(if allowed {
                "Добавить карту в выбранную колоду"
            } else {
                "Этот набор не разрешён в колоде"
            });
        });
    }
    fn card_row(&mut self, ui: &mut egui::Ui, card: &Card) {
        let compact = ui.available_width() < 460.0;
        let title = |app: &mut Self, ui: &mut egui::Ui, width: f32| {
            app.card_image(ui, card, 46.0);
            ui.vertical(|ui| {
                ui.set_width(width);
                if ui
                    .add(
                        egui::Label::new(skin::heading(&card.name, 17.0))
                            .truncate()
                            .sense(egui::Sense::click()),
                    )
                    .clicked()
                {
                    app.detail = Some(card.id.clone());
                }
                ui.add(
                    egui::Label::new(format!(
                        "{} · {} · {}",
                        card.cost,
                        app.cat.color_name(card.color),
                        app.cat.edition_name(card)
                    ))
                    .truncate(),
                );
            });
        };
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                let text_width =
                    (ui.available_width() - if compact { 60.0 } else { 295.0 }).max(80.0);
                title(self, ui, text_width);
                if !compact {
                    self.card_controls(ui, card);
                }
            });
            if compact {
                self.card_controls(ui, card);
            }
        });
    }
    pub(super) fn card_image(
        &mut self,
        ui: &mut egui::Ui,
        card: &Card,
        width: f32,
    ) -> egui::Response {
        let (rect, response) = ui.allocate_exact_size(
            egui::vec2(width, width * 1088.0 / 768.0),
            egui::Sense::click(),
        );
        response.widget_info(|| {
            egui::WidgetInfo::labeled(egui::WidgetType::Button, ui.is_enabled(), &card.name)
        });
        self.card_surface(ui, card, &response, rect);
        if response.clicked() {
            self.detail = Some(card.id.clone());
        }
        response
    }
    fn card_surface(
        &mut self,
        ui: &egui::Ui,
        card: &Card,
        response: &egui::Response,
        rect: egui::Rect,
    ) {
        if !ui.is_rect_visible(card_shape::bounds(rect)) {
            return;
        }
        let reduced = self.settings.reduced || self.motion.reduced;
        let pose = card_shape::pose(ui, response, reduced);
        card_shape::body(ui, rect, pose);
        self.visible_cards += 1;
        if let Some(texture) = self.images.get(
            self.cat.image(card),
            rect.size(),
            ui.ctx().pixels_per_point(),
        ) {
            if !self
                .effects
                .lock()
                .unwrap()
                .ready(card, self.settings.effects)
            {
                card_shape::image(ui, texture.id(), rect, pose);
            }
            self.animated |= effects::Effects::paint(
                &self.effects,
                ui,
                rect,
                texture.id(),
                card,
                effects::Surface {
                    pose,
                    reduced,
                    effects: self.settings.effects,
                },
            );
        } else {
            ui.painter().text(
                rect.center(),
                egui::Align2::CENTER_CENTER,
                &card.name,
                egui::FontId::proportional(13.0),
                skin::GOLD,
            );
        }
    }
    pub(super) fn detail_window(&mut self, ctx: &egui::Context) {
        let Some(card) = self
            .detail
            .as_deref()
            .and_then(|id| self.cat.get(id))
            .cloned()
        else {
            return;
        };
        let mut open = true;
        egui::Window::new(format!("{} · {}",card.name,self.cat.edition_name(&card))).id(egui::Id::new("detail")).open(&mut open).default_width(790.0).default_height(650.0).default_pos(egui::pos2(((ctx.content_rect().width()-820.0)*0.5).max(15.0),50.0)).frame(egui::Frame::window(&ctx.style_of(egui::Theme::Dark)).inner_margin(18)).vscroll(true).show(ctx, |ui| {
            ui.add_enabled_ui(self.pending.is_none(), |ui| {
                ui.horizontal_top(|ui| {
                    self.card_image(ui,&card,300.0);
                    ui.vertical(|ui| {
                        ui.set_min_width(350.0); ui.heading(&card.name);
                        ui.label(format!("{} · #{} · {}",self.cat.set_name(card.set_id),card.number,card.id));
                        ui.label(format!("{} · {} · {}",self.cat.color_name(card.color),self.cat.rarity_name(card.rarity),if card.elite {"Элитная"} else {"Неэлитная"}));
                        ui.label(card.classes.join(" · "));
                        ui.label(format!("Цена: {} · Здоровье: {} · Ход: {} · Удар: {}",card.cost,card.life.map(|n|n.to_string()).unwrap_or("—".into()),card.r#move.map(|n|n.to_string()).unwrap_or("—".into()),card.hit.as_ref().map(|h|h.iter().map(ToString::to_string).collect::<Vec<_>>().join("–")).unwrap_or_default()));
                        if card.uniq { ui.label("Уникальная"); }
                        if card.ban == true { ui.colored_label(egui::Color32::LIGHT_RED,"Это издание запрещено в отряде"); }
                        ui.label(self.cat.rules_text(&card));
                        for (key,value) in &card.icons { ui.label(format!("{} {}",self.cat.constants.icons.get(key).unwrap_or(key),value)); }
                        ui.label(format!("Художник: {}",card.art));
                        if card.uses_base_art() { ui.label("Скан этого издания пока недоступен. Показана иллюстрация обычной карты."); }
                        ui.separator(); self.card_controls(ui,&card);
                        if self.page == Page::Decks {
                            let name = self.deck().map(|d| d.name.as_str()).unwrap_or("Выберите колоду");
                            egui::ComboBox::from_id_salt("detail_deck").selected_text(name).show_ui(ui, |ui| { for d in &self.user.decks { if ui.selectable_value(&mut self.active,Some(d.id.clone()),&d.name).changed() { self.dirty = true; } } });
                            ui.checkbox(&mut self.side,"Добавлять в запас");
                        }
                        ui.separator(); ui.strong("Издания в коллекции");
                        for alt in std::iter::once(String::new()).chain(card.alts.clone()) {
                            let Some(edition) = self.cat.get(&format!("{}{}",card.base_id,alt)).cloned() else { continue };
                            ui.horizontal(|ui| {
                                if ui.selectable_label(edition.id==card.id,self.cat.edition_name(&edition)).clicked() { self.detail = Some(edition.id.clone()); }
                                let mut count = self.user.count(&edition.id);
                                if ui.add(egui::DragValue::new(&mut count).range(0..=u32::MAX)).changed() { self.change(|u|u.set_count(&edition.id,count)); }
                            });
                        }
                        ui.collapsing("Тиражи, цены и оценки", |ui| {
                            ui.label(format!("Карапет: {:.1} · MotD: {}",self.cat.rating(&card),self.cat.rank(&card)+1));
                            for (key,value) in &card.prints { ui.label(format!("{key}: {value}")); }
                            if let Some(entry) = self.user.collection.get(&card.id) {
                                for key in entry.count.keys().chain(entry.costs.keys()).collect::<BTreeSet<_>>() { ui.label(format!("{}: {} шт. · {} ₽",if key.is_empty(){"Всего"}else{key},entry.count.get(key).map(ToString::to_string).unwrap_or("—".into()),entry.costs.get(key).map(ToString::to_string).unwrap_or("—".into()))); }
                            }
                        });
                    });
                });
            });
        });
        if !open {
            self.detail = None;
        }
    }
    pub(super) fn draft_window(&mut self, ctx: &egui::Context) {
        let Some(mut deck) = self.draft.take() else {
            return;
        };
        let mut open = true;
        let mut create = false;
        egui::Window::new("Новая колода")
            .open(&mut open)
            .default_width(440.0)
            .vscroll(true)
            .show(ctx, |ui| {
                ui.label("Название");
                ui.text_edit_singleline(&mut deck.name);
                sets(
                    ui,
                    &self.cat,
                    deck.allowed_sets
                        .get_or_insert_with(|| self.settings.allowed_sets.clone()),
                );
                let error = deck.validate_sets(&self.cat).err();
                if let Some(e) = &error {
                    ui.colored_label(egui::Color32::LIGHT_RED, e);
                }
                create = ui
                    .add_enabled(
                        error.is_none()
                            && !deck.name.trim().is_empty()
                            && self.pending.is_none()
                            && self.storage_error.is_none(),
                        egui::Button::new("Создать колоду"),
                    )
                    .clicked();
            });
        if create {
            self.settings.allowed_sets = deck
                .allowed_sets
                .clone()
                .unwrap_or_else(|| self.cat.set_ids());
            let mut next = self.user.clone();
            let id = deck.id.clone();
            next.decks.insert(0, deck);
            self.submit(next, None, Some(id), false);
        } else if open {
            self.draft = Some(deck);
        }
    }
    pub(super) fn deck_library(&mut self, ui: &mut egui::Ui) {
        ui.heading("Мои колоды");
        ui.horizontal(|ui| {
            if ui.button("Новая колода").clicked() {
                let mut d = Deck::new(Self::id(), "Новая колода".into());
                d.allowed_sets = Some(self.settings.allowed_sets.clone());
                self.draft = Some(d);
            }
            if ui.button("Создать с Codex").clicked() {
                self.page = Page::CreateWithCodex;
            }
        });
        if self.progress.busy() {
            ui.horizontal_wrapped(|ui| {
                ui.spinner();
                ui.label(&self.progress.message);
                if ui.button("Открыть Codex").clicked() {
                    self.page = Page::CreateWithCodex;
                }
            });
        }
        ui.add_space(12.0);
        if self.user.decks.is_empty() {
            ui.add_space(60.0);
            ui.vertical_centered(|ui| {
                ui.label(skin::heading("У каждой колоды — своя история", 28.0));
                ui.label("Создайте колоду, выберите наборы и добавьте карты из книги.");
            });
        }
        let columns = (ui.available_width() / 290.0).floor().max(1.0) as usize;
        let width = ((ui.available_width() - 20.0 * (columns - 1) as f32 - 12.0) / columns as f32)
            .min(340.0);
        egui::ScrollArea::vertical().show_rows(
            ui,
            140.0,
            self.user.decks.len().div_ceil(columns),
            |ui, rows| {
                for row in rows {
                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 20.0;
                        for index in
                            (row * columns)..((row + 1) * columns).min(self.user.decks.len())
                        {
                            let d = self.user.decks[index].clone();
                            ui.push_id(&d.id, |ui| {
                                let (rect, _) = ui.allocate_exact_size(
                                    egui::vec2(width, 132.0),
                                    egui::Sense::hover(),
                                );
                                ui.painter().rect_filled(
                                    rect.translate(egui::vec2(0.0, 5.0)).expand(2.0),
                                    5.0,
                                    egui::Color32::from_black_alpha(65),
                                );
                                skin::Skin::paint(
                                    &self.skin,
                                    ui,
                                    rect,
                                    skin::Material::Leather,
                                    0.0,
                                );
                                skin::ornament(ui, rect);
                                for (i, id) in d.cards.iter().take(1).enumerate() {
                                    if let Some(card) = self.cat.get(id).cloned() {
                                        let r = egui::Rect::from_min_size(
                                            rect.min + egui::vec2(12.0 + i as f32 * 8.0, 14.0),
                                            egui::vec2(74.0, 105.0),
                                        );
                                        let response = ui.interact(
                                            r,
                                            ui.id().with(("preview", i)),
                                            egui::Sense::hover(),
                                        );
                                        self.card_surface(ui, &card, &response, r);
                                    }
                                }
                                ui.scope_builder(
                                    egui::UiBuilder::new()
                                        .layout(egui::Layout::top_down(egui::Align::Min))
                                        .max_rect(egui::Rect::from_min_max(
                                            rect.min + egui::vec2(98.0, 14.0),
                                            rect.max - egui::vec2(18.0, 10.0),
                                        )),
                                    |ui| {
                                        ui.add(
                                            egui::Label::new(
                                                skin::heading(&d.name, 18.0).color(skin::GOLD),
                                            )
                                            .truncate(),
                                        )
                                        .on_hover_text(&d.name);
                                        ui.add(
                                            egui::Label::new(
                                                RichText::new(format!(
                                                    "{} карт  ·  {} в запасе",
                                                    d.cards.len(),
                                                    d.side.len()
                                                ))
                                                .color(egui::Color32::from_rgb(202, 190, 161)),
                                            )
                                            .truncate(),
                                        );
                                        ui.horizontal(|ui| {
                                            ui.spacing_mut().item_spacing.x = 6.0;
                                            if skin::button(
                                                &self.skin,
                                                ui,
                                                "Открыть",
                                                egui::vec2(84.0, 34.0),
                                                false,
                                            )
                                            .clicked()
                                            {
                                                self.active = Some(d.id.clone());
                                                self.deck_full = false;
                                                self.side = false;
                                                self.dirty = true;
                                                self.hand = Hand::default();
                                                self.notes_draft = None;
                                            }
                                            if skin::button(
                                                &self.skin,
                                                ui,
                                                "Удалить",
                                                egui::vec2(70.0, 34.0),
                                                false,
                                            )
                                            .clicked()
                                            {
                                                self.delete = Some(d.id.clone());
                                            }
                                        });
                                    },
                                );
                            });
                        }
                    });
                }
            },
        );
    }
    pub(super) fn deck_panel(&mut self, ui: &mut egui::Ui) {
        let Some(deck) = self.deck().cloned() else {
            return;
        };
        egui::Panel::bottom("deck-actions")
            .frame(egui::Frame::new().inner_margin(egui::Margin::symmetric(0, 8)))
            .show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().button_padding.x = 4.0;
                    if ui
                        .add_enabled(!deck.cards.is_empty(), egui::Button::new("Раздача"))
                        .clicked()
                    {
                        self.hand = Hand {
                            open: true,
                            ..Default::default()
                        };
                        self.draw();
                    }
                    if ui
                        .button(if self.deck_full {
                            "Карты"
                        } else {
                            "Подробно"
                        })
                        .on_hover_text(if self.deck_full {
                            "Вернуться к каталогу карт"
                        } else {
                            "Показать все карты колоды, запас и вероятность раздачи"
                        })
                        .clicked()
                    {
                        self.deck_full = !self.deck_full;
                    }
                    ui.menu_button("Обсудить с Codex", |ui| {
                        ui.set_width(320.0);
                        self.refine_with_codex(ui);
                    });
                });
            });
        egui::ScrollArea::vertical()
            .id_salt("deck_panel")
            .show(ui, |ui| {
                if self.rename.as_ref().is_none_or(|(id, _)| id != &deck.id) {
                    self.rename = Some((deck.id.clone(), deck.name.clone()));
                }
                let (_, name) = self.rename.as_mut().unwrap();
                let response = ui.text_edit_singleline(name);
                if response.lost_focus() && !name.trim().is_empty() && *name != deck.name {
                    let name = name.clone();
                    self.edit_deck(|d| d.name = name);
                }
                ui.horizontal(|ui| {
                    ui.selectable_value(
                        &mut self.side,
                        false,
                        format!("Колода ({})", deck.cards.len()),
                    );
                    ui.selectable_value(
                        &mut self.side,
                        true,
                        format!("Запас ({})", deck.side.len()),
                    );
                });
                let ids = if self.side { &deck.side } else { &deck.cards };
                let cards: Vec<_> = deck_widgets::sorted_cards(ids, &self.cat)
                    .into_iter()
                    .map(|(card, count)| (card.clone(), count))
                    .collect();
                ui.scope(|ui| {
                    ui.spacing_mut().item_spacing.y = 3.0;
                    for (card, count) in cards {
                        let id = &card.id;
                        ui.push_id(id, |ui| {
                            egui::Frame::new()
                                .fill(egui::Color32::from_black_alpha(35))
                                .inner_margin(egui::Margin::symmetric(4, 2))
                                .corner_radius(3)
                                .show(ui, |ui| {
                                    ui.spacing_mut().item_spacing.x = 3.0;
                                    ui.spacing_mut().button_padding = egui::vec2(3.0, 2.0);
                                    ui.spacing_mut().interact_size = egui::vec2(22.0, 26.0);
                                    ui.horizontal(|ui| {
                                        deck_widgets::set_icon(
                                            ui,
                                            card.set_id,
                                            &self.cat.set_name(card.set_id),
                                        );
                                        ui.add_sized(
                                            [30.0, 26.0],
                                            egui::Label::new(
                                                RichText::new(format!("#{}", card.number))
                                                    .size(11.0),
                                            ),
                                        )
                                        .on_hover_text(self.cat.edition_name(&card));
                                        // Reserve every control and gap so rows cannot widen the panel.
                                        let name_width = (ui.available_width() - 134.0).max(24.0);
                                        if ui
                                            .allocate_ui_with_layout(
                                                egui::vec2(name_width, 26.0),
                                                egui::Layout::left_to_right(egui::Align::Center),
                                                |ui| {
                                                    ui.set_min_size(egui::vec2(name_width, 26.0));
                                                    ui.add(
                                                        egui::Label::new(
                                                            RichText::new(&card.name)
                                                                .color(skin::GOLD),
                                                        )
                                                        .truncate()
                                                        .sense(egui::Sense::click()),
                                                    )
                                                },
                                            )
                                            .inner
                                            .on_hover_text(format!(
                                                "{} · {}",
                                                card.name,
                                                self.cat.edition_name(&card)
                                            ))
                                            .clicked()
                                        {
                                            self.detail = Some(id.clone());
                                        }
                                        deck_widgets::coin(ui, card.cost, card.elite);
                                        let side = self.side;
                                        if ui
                                            .add_sized([22.0, 26.0], egui::Button::new("−"))
                                            .on_hover_text("Убрать карту")
                                            .clicked()
                                        {
                                            self.edit_deck(|d| d.remove(id, side));
                                        }
                                        ui.add_sized(
                                            [24.0, 26.0],
                                            egui::Label::new(count.to_string()).truncate(),
                                        );
                                        if ui
                                            .add_sized([22.0, 26.0], egui::Button::new("+"))
                                            .on_hover_text("Добавить карту")
                                            .clicked()
                                        {
                                            self.edit_deck(|d| d.add(id, side));
                                        }
                                        if deck_widgets::move_button(ui, side).clicked() {
                                            self.edit_deck(|d| {
                                                d.remove(id, side);
                                                d.add(id, !side);
                                            });
                                        }
                                    });
                                });
                        });
                    }
                });
                let stats = Stats::of(&deck.cards, &self.cat);
                ui.separator();
                ui.label(format!(
                    "{} карт · золото {} · серебро {}",
                    stats.total, stats.gold, stats.silver
                ));
                egui::CollapsingHeader::new("Стоимость и стихии")
                    .default_open(true)
                    .show(ui, |ui| {
                        deck_widgets::histogram(ui, &stats);
                        for (color, n) in &stats.colors {
                            ui.label(format!("{}: {n}", self.cat.color_name(*color)));
                        }
                    });
                ui.collapsing("Разрешённые наборы", |ui| {
                    let mut selected = deck
                        .allowed_sets
                        .clone()
                        .unwrap_or_else(|| self.cat.set_ids());
                    sets(ui, &self.cat, &mut selected);
                    if Some(&selected) != deck.allowed_sets.as_ref() {
                        self.edit_deck(|d| d.allowed_sets = Some(selected));
                        self.dirty = true;
                    }
                });
                ui.separator();
                if ui
                    .button(if self.notes_edit {
                        "Отмена редактирования"
                    } else {
                        "Редактировать заметки"
                    })
                    .clicked()
                {
                    self.notes_edit = !self.notes_edit;
                    self.notes_draft = Some(deck.clone());
                }
                if self.notes_edit {
                    let draft = self.notes_draft.get_or_insert_with(|| deck.clone());
                    for (label, text) in [
                        ("Описание", &mut draft.description),
                        ("Как играть", &mut draft.how_to_play),
                        ("Улучшения", &mut draft.improvements),
                    ] {
                        ui.label(label);
                        ui.add(
                            egui::TextEdit::multiline(text)
                                .desired_rows(5)
                                .desired_width(f32::INFINITY),
                        );
                    }
                    ui.label("Markdown и ссылки [card:ID]");
                    if ui.button("Сохранить заметки").clicked() {
                        let draft = self.notes_draft.take().unwrap();
                        self.edit_deck(|d| {
                            d.description = draft.description;
                            d.how_to_play = draft.how_to_play;
                            d.improvements = draft.improvements;
                        });
                        self.notes_edit = false;
                    }
                } else {
                    for (label, text) in [
                        ("Описание", &deck.description),
                        ("Как играть", &deck.how_to_play),
                        ("Улучшения", &deck.improvements),
                    ] {
                        if !text.is_empty() {
                            ui.strong(label);
                            if let Some(id) = notes::show(ui, text, &self.cat) {
                                self.detail = Some(id);
                            }
                        }
                    }
                }
            });
    }
    fn codex_status(&mut self, ui: &mut egui::Ui) {
        if self.bridge.is_none() {
            self.connect(ui.ctx(), None);
        }
        egui::Frame::new().fill(egui::Color32::from_rgb(224, 207, 174))
            .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(160, 135, 91)))
            .corner_radius(6).inner_margin(12).show(ui, |ui| {
                ui.set_width(ui.available_width());
                skin::paper_style(ui);
                if self.external_service {
                    ui.strong("Внешний сервис Codex");
                    ui.small("Вход используется на стороне подключённого сервиса.");
                } else {
                    if self.login.is_none() && ui.input(|i| i.viewport().focused.unwrap_or(true)) {
                        self.codex_auth.ensure(ui.ctx());
                    }
                    let status = self.codex_auth.status;
                    ui.horizontal_wrapped(|ui| {
                        if self.codex_auth.checking() || self.login.is_some() { ui.spinner(); }
                        let color = if status == codex_auth::Status::SignedIn { egui::Color32::from_rgb(59, 93, 58) } else { skin::INK };
                        ui.strong(egui::RichText::new(if self.login.is_some() { "Завершите вход в браузере" } else { status.label() }).color(color));
                        if ui.add_enabled(!self.codex_auth.checking() && self.login.is_none(), egui::Button::new("Проверить вход")).clicked() {
                            self.codex_auth.invalidate();
                            self.codex_auth.ensure(ui.ctx());
                        }
                        if status != codex_auth::Status::SignedIn && status != codex_auth::Status::Missing
                            && ui.add_enabled(self.login.is_none(), egui::Button::new("Войти в Codex")).clicked() {
                            let mut command = bridge::codex_command();
                            command.arg("login").stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
                            match command.spawn() {
                                Ok(child) => {
                                    self.login = Some(child);
                                    self.codex_auth.invalidate();
                                    self.status = "Завершите вход в открывшемся браузере".into();
                                }
                                Err(_) => { self.codex_auth.invalidate(); self.status = "Не удалось запустить вход в Codex. Проверьте установку CLI.".into(); }
                            }
                        }
                    });
                    if let Some(age) = self.codex_auth.age() {
                        ui.small(if self.codex_auth.checking() { "Обновляем сохранённый статус…".into() }
                            else if matches!(status, codex_auth::Status::Failed | codex_auth::Status::Missing | codex_auth::Status::TimedOut) { "Повторная проверка через 30 секунд".into() }
                            else if age.as_secs() < 60 { "Проверено только что · статус сохранён на 5 минут".into() }
                            else { format!("Проверено {} мин назад · статус сохранён на 5 минут", age.as_secs() / 60) });
                    }
                    match status {
                        codex_auth::Status::Missing => { ui.hyperlink_to("Установить Codex CLI", "https://developers.openai.com/codex/cli"); }
                        codex_auth::Status::Failed | codex_auth::Status::TimedOut => { ui.small("Проверка недоступна. Можно повторить её или попробовать создать колоду."); }
                        _ => {}
                    }
                    if self.login.is_some() && ui.small_button("Отменить вход").clicked() {
                        if let Some(mut child) = self.login.take() { let _ = child.kill(); let _ = child.wait(); }
                        self.codex_auth.invalidate();
                    }
                }
                if let Some(error) = &self.connection_error {
                    ui.label(format!("Сервис недоступен: {error}"));
                    if ui.button("Повторить подключение").clicked() {
                        let pair = self.external_service.then(|| self.pair_url.clone());
                        self.connect(ui.ctx(), pair);
                    }
                } else {
                    ui.small(if self.connected { "Сервис создания колод готов" } else { "Подключаем сервис создания колод…" });
                }
            });
    }
    pub(super) fn codex_creation(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            if ui.button("К моим колодам").clicked() {
                self.page = Page::Decks;
                self.active = None;
            }
            ui.heading("Создать с Codex");
        });
        ui.label("Соберите колоду из своих карт и получите план игры.");
        ui.add_space(6.0);
        // Keep the primary action visible even when sets or the prompt are expanded.
        let body_height = (ui.available_height() - 120.0).max(100.0);
        egui::ScrollArea::vertical().id_salt("codex-create-form").max_height(body_height)
            .auto_shrink([false, false]).show(ui, |ui| {
                ui.set_max_width(780.0);
                self.codex_status(ui);
                ui.add_space(10.0);
                ui.horizontal_wrapped(|ui| {
                    ui.strong(format!("В коллекции: {} карт", self.user.total()));
                    if ui.button("Импорт коллекции").clicked() { self.open_transfer(TransferKind::Collection); }
                    ui.label("Размер колоды");
                    ui.add(egui::DragValue::new(&mut self.ai_size).range(30..=50).suffix(" карт"));
                });
                ui.add_space(6.0);
                ui.strong("Какой колодой хотите играть?");
                ui.add(egui::TextEdit::multiline(&mut self.preferences).desired_rows(3).desired_width(f32::INFINITY)
                    .hint_text("Например: агрессивная колода лесов и болот, с простым планом игры"));
                set_selector(ui, &self.cat, &mut self.settings.allowed_sets, false);
                ui.collapsing("Как Codex собирает колоду", |ui| {
                    ui.label("Учитывает доступные карты и выбранные наборы, описывает стратегию и проверяет пять стартовых раздач.");
                    ui.hyperlink_to("Основы колодостроения", crate::deck_prompt::ARTICLE_URL);
                    ui.collapsing("Посмотреть запрос", |ui| {
                        match crate::deck_prompt::deck_build_prompt(self.ai_size, &self.preferences, Some(&self.settings.allowed_sets)) {
                            Ok(mut prompt) => { ui.add(egui::TextEdit::multiline(&mut prompt).desired_rows(10).desired_width(f32::INFINITY).interactive(false)); }
                            Err(error) => { ui.label(error); }
                        }
                    });
                });
                ui.small("Codex получает правила и количество карт. Покупные цены не передаются.");
            });
        ui.separator();
        if self.progress.busy() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.strong("Codex работает над колодой");
                if ui.button("Отменить генерацию").clicked() {
                    self.build(BuildEvent::CancelBuild {
                        request_id: self.progress.request_id.clone(),
                    });
                }
            });
            egui::ScrollArea::vertical()
                .id_salt("codex-progress-message")
                .max_height(48.0)
                .show(ui, |ui| {
                    ui.label(&self.progress.message);
                });
        } else {
            ui.horizontal_wrapped(|ui| {
                if ui
                    .add_enabled(
                        self.ai_blocker(false).is_none(),
                        egui::Button::new(
                            egui::RichText::new("Создать колоду")
                                .strong()
                                .color(skin::INK),
                        )
                        .fill(skin::GOLD)
                        .min_size(egui::vec2(220.0, 42.0)),
                    )
                    .clicked()
                {
                    self.build(BuildEvent::BuildDeck {
                        request_id: Self::id(),
                        size: self.ai_size,
                        preferences: self.preferences.clone(),
                        allowed_sets: Some(self.settings.allowed_sets.clone()),
                    });
                }
                if self.user.total() == 0 && ui.button("Добавить карты").clicked() {
                    self.page = Page::Catalog;
                    self.filter = Filter::default();
                    self.page_number = 0;
                    self.dirty = true;
                }
            });
            egui::ScrollArea::vertical()
                .id_salt("codex-create-message")
                .max_height(48.0)
                .show(ui, |ui| {
                    if let Some(reason) = self.ai_blocker(false) {
                        ui.label(reason);
                    }
                    if !self.progress.message.is_empty() {
                        ui.label(&self.progress.message);
                    }
                });
        }
    }
    fn refine_with_codex(&mut self, ui: &mut egui::Ui) {
        self.codex_status(ui);
        ui.add(
            egui::TextEdit::multiline(&mut self.feedback)
                .desired_width(f32::INFINITY)
                .hint_text("Что изменить в колоде?"),
        );
        ui.checkbox(&mut self.restart, "Начать новую беседу");
        if let Some(session) = self.deck().and_then(|d| d.agent_session.as_ref()) {
            ui.collapsing("История обсуждения", |ui| {
                for feedback in &session.feedback {
                    ui.label(feedback);
                }
            });
        }
        if ui
            .add_enabled(
                self.ai_blocker(true).is_none(),
                egui::Button::new("Отправить"),
            )
            .clicked()
            && let Some(deck) = self.deck()
        {
            self.build(BuildEvent::RefineDeck {
                request_id: Self::id(),
                deck_id: deck.id.clone(),
                expected_revision: agent::revision(deck),
                feedback: self.feedback.clone(),
                restart_session: self.restart,
            });
        }
        if let Some(reason) = self.ai_blocker(true) {
            ui.label(reason);
        }
        ui.label(&self.progress.message);
        if self.progress.busy() && ui.button("Отменить генерацию").clicked() {
            self.build(BuildEvent::CancelBuild {
                request_id: self.progress.request_id.clone(),
            });
        }
    }
    fn draw(&mut self) {
        if let Some(deck) = self.deck() {
            let seed = uuid::Uuid::new_v4().as_u128() as u64;
            let mut cards = deck.cards.clone();
            crate::shuffle::Rng::new(seed).shuffle(&mut cards);
            cards.truncate(15);
            self.hand.cards = cards;
            self.hand.selected.clear();
        }
    }
    pub(super) fn hand_window(&mut self, ctx: &egui::Context) {
        if !self.hand.open {
            return;
        }
        let mut open = true;
        egui::Window::new("Пробная раздача")
            .open(&mut open)
            .default_width(900.0)
            .vscroll(true)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    if ui.button("Новая раздача").clicked() {
                        self.hand.mulligans = 0;
                        self.draw();
                    }
                    if ui.button("Пересдать (−1 золото)").clicked() {
                        self.hand.mulligans = self.hand.mulligans.saturating_add(1);
                        self.draw();
                    }
                    ui.checkbox(&mut self.hand.second, "Хожу вторым");
                });
                let squad: Vec<_> = self
                    .hand
                    .selected
                    .iter()
                    .filter_map(|&i| self.hand.cards.get(i).cloned())
                    .collect();
                let (gold, silver) =
                    squad_budget(&squad, &self.cat, self.hand.second, self.hand.mulligans);
                ui.label(format!(
                    "Осталось: {gold} золота · {silver} серебра · пересдач {} · в отряде {}",
                    self.hand.mulligans,
                    squad.len()
                ));
                if gold < 0 || silver < 0 {
                    ui.colored_label(egui::Color32::LIGHT_RED, "Не хватает кристаллов");
                }
                for issue in squad_issues(&squad, &self.cat) {
                    ui.colored_label(egui::Color32::LIGHT_RED, issue);
                }
                for row in (0..self.hand.cards.len()).collect::<Vec<_>>().chunks(5) {
                    ui.horizontal_top(|ui| {
                        for &i in row {
                            let Some(card) = self.cat.get(&self.hand.cards[i]).cloned() else {
                                continue;
                            };
                            ui.push_id(i, |ui| {
                                ui.vertical(|ui| {
                                    let detail = self.detail.clone();
                                    if self.card_image(ui, &card, 145.0).clicked() {
                                        self.detail = detail;
                                        if !self.hand.selected.remove(&i) {
                                            self.hand.selected.insert(i);
                                        }
                                    }
                                    if ui.link(&card.name).clicked() {
                                        self.detail = Some(card.id.clone());
                                    }
                                    let mut checked = self.hand.selected.contains(&i);
                                    if ui.checkbox(&mut checked, "В отряде").changed() {
                                        if checked {
                                            self.hand.selected.insert(i);
                                        } else {
                                            self.hand.selected.remove(&i);
                                        }
                                    }
                                });
                            });
                        }
                    });
                }
            });
        self.hand.open = open;
    }
    pub(super) fn delete_window(&mut self, ctx: &egui::Context) {
        let Some(id) = self.delete.clone() else {
            return;
        };
        let Some(deck) = self.user.decks.iter().find(|deck| deck.id == id) else {
            self.delete = None;
            return;
        };
        let name = deck.name.clone();
        let mut open = true;
        egui::Window::new("Удалить колоду?")
            .collapsible(false)
            .resizable(false)
            .open(&mut open)
            .show(ctx, |ui| {
                ui.label(format!("Удалить «{name}»?"));
                ui.label("Удаление можно отменить.");
                ui.horizontal(|ui| {
                    if ui
                        .add_enabled(
                            self.pending.is_none() && self.storage_error.is_none(),
                            egui::Button::new("Удалить"),
                        )
                        .clicked()
                    {
                        self.change(|user| user.decks.retain(|deck| deck.id != id));
                        self.delete = None;
                    }
                    if ui.button("Отмена").clicked() {
                        self.delete = None;
                    }
                });
            });
        if !open {
            self.delete = None;
        }
    }
}

//! Display-only projection of the public `codex exec --json` stream.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Chat {
    pub entries: Vec<Entry>,
    pub omitted: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub text: String,
    pub details: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sections: Vec<Section>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Section {
    pub title: String,
    pub text: String,
}

/// Bound UTF-8 text without breaking a character; large output stays expandable
/// up to this limit, and truncation is always visible.
pub fn excerpt(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_owned();
    }
    let mut end = limit;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… [сокращено]", &text[..end])
}

fn display(value: &Value) -> String {
    if value.is_null() {
        String::new()
    } else if let Some(text) = value.as_str() {
        text.to_owned()
    } else {
        serde_json::to_string_pretty(value).unwrap_or_default()
    }
}

impl Entry {
    /// Normalize the CLI's recoverable startup diagnostic, including saved chats.
    /// Keep this a presentation change so stored deck revisions stay unchanged.
    pub fn for_display(&self) -> std::borrow::Cow<'_, Self> {
        let message = &self.text;
        let managed_fallback = self.kind == "system"
            && self.title == "Ошибка Codex"
            && !self.id.ends_with(":turn.failed")
            && !self.id.ends_with(":error")
            && message.starts_with("Configured value for `approval_policy` is disallowed by requirements; falling back to required value ")
            && (message.contains("required value UnlessTrusted.")
                || message.contains("required value OnRequest."))
            && message.contains("invalid value for `approval_policy`: `Never` is not in the allowed set");
        if !managed_fallback {
            return std::borrow::Cow::Borrowed(self);
        }
        let mut entry = self.clone();
        entry.kind = "notice".into();
        entry.title = "Применены настройки администратора".into();
        entry.text = "Codex применил разрешённую политику подтверждений. Это уведомление само по себе не останавливает работу.".into();
        entry.details = self.text.clone();
        entry.status = "notice".into();
        std::borrow::Cow::Owned(entry)
    }
    pub fn message(id: String, kind: &str, title: &str, text: &str) -> Self {
        Self {
            id,
            kind: kind.into(),
            title: title.into(),
            text: excerpt(text, 8_000),
            details: String::new(),
            status: "completed".into(),
            sections: Vec::new(),
        }
    }
    pub fn status_label(&self) -> &str {
        match self.status.as_str() {
            "in_progress" => "Выполняется",
            "failed" => "Ошибка",
            "cancelled" => "Прервано",
            "notice" => "Уведомление",
            _ => "Готово",
        }
    }
    pub fn compact(&self) -> bool {
        matches!(self.kind.as_str(), "tool" | "reasoning" | "plan" | "notice")
    }

    pub fn preview(&self) -> String {
        excerpt(
            &self.text.split_whitespace().collect::<Vec<_>>().join(" "),
            240,
        )
    }

    fn section(&mut self, title: &str, text: String) {
        if !text.is_empty() {
            self.sections.push(Section {
                title: title.into(),
                text: excerpt(&text, 4_000),
            });
        }
    }

    pub fn from_event(event: &Value, request: &str) -> Option<Self> {
        let event_type = event["type"].as_str()?;
        if matches!(event_type, "error" | "turn.failed") {
            let message = event
                .get("message")
                .or_else(|| event.get("error").and_then(|e| e.get("message")))?;
            let mut entry = Self::message(
                format!("{request}:{event_type}"),
                "system",
                "Ошибка Codex",
                &display(message),
            );
            entry.status = "failed".into();
            return Some(entry);
        }
        if !matches!(
            event_type,
            "item.started" | "item.updated" | "item.completed"
        ) {
            return None;
        }
        let item = &event["item"];
        let id = format!("{request}:{}", item["id"].as_str()?);
        let item_type = item["type"].as_str()?;
        let mut entry = Self::message(id, "tool", "Действие Codex", "");
        entry.status = item["status"]
            .as_str()
            .unwrap_or(if event_type == "item.completed" {
                "completed"
            } else {
                "in_progress"
            })
            .into();
        match item_type {
            "agent_message" | "reasoning" => {
                entry.kind = if item_type == "reasoning" {
                    "reasoning"
                } else {
                    "assistant"
                }
                .into();
                entry.title = if item_type == "reasoning" {
                    "Ход рассуждений"
                } else {
                    "Codex"
                }
                .into();
                entry.text = display(&item["text"]);
                // The final response is a deck proposal. Present its prose rather
                // than dumping the schema and card IDs into the conversation.
                if item_type == "agent_message"
                    && let Ok(proposal) = serde_json::from_str::<Value>(&entry.text)
                    && proposal.get("status").is_some()
                {
                    entry.text = ["name", "explanation", "description"]
                        .iter()
                        .filter_map(|key| proposal[*key].as_str())
                        .collect::<Vec<_>>()
                        .join("\n\n");
                }
            }
            "mcp_tool_call" => {
                let tool = item["tool"].as_str().unwrap_or("Инструмент");
                let label = match tool {
                    "catalog_info" => "Изучает каталог",
                    "search_cards" => "Ищет карты",
                    "get_card" => "Читает карту",
                    "deal_deck" => "Проверяет раздачу текущей колоды",
                    "begin_deck_edit" => "Открывает колоду для изменений",
                    "get_current_deck" => "Изучает текущую колоду",
                    "set_deck_card_counts" => "Меняет состав колоды",
                    "set_deck_notes" => "Обновляет описание и план игры",
                    "validate_current_deck" => "Проверяет текущую колоду",
                    "save_current_deck" => "Отправляет изменения колоды",
                    "discard_deck_edit" => "Отменяет черновик изменений",
                    "search_proberserk_tournaments" => "Ищет крупные турниры",
                    "get_proberserk_tournament" => "Изучает результаты турнира",
                    "get_proberserk_deck" => "Изучает турнирную колоду",
                    "analyze_proberserk_decks" => "Сравнивает колоды победителей",
                    "search_deck_memory" => "Вспоминает опыт прошлых колод",
                    "remember_deck_insight" => "Сохраняет полезный опыт",
                    _ => tool,
                };
                entry.title = label.replace('_', " ");
                entry.text = argument_summary(&item["arguments"]);
                entry.section("Параметры", readable(&decoded(&item["arguments"])));
                entry.section("Результат", result_text(&item["result"]));
                entry.details = format!(
                    "{} · {}\n\nПараметры\n{}\n\nРезультат\n{}",
                    display(&item["server"]),
                    tool,
                    display(&item["arguments"]),
                    display(&item["result"])
                );
                if !item["error"].is_null() || item["result"]["isError"] == true {
                    entry.status = "failed".into();
                    entry.section("Ошибка", readable(&item["error"]));
                    entry
                        .details
                        .push_str(&format!("\n{}", display(&item["error"])));
                }
            }
            "command_execution" => {
                entry.title = "Выполняет команду".into();
                entry.text = display(&item["command"]);
                entry.section("Команда", entry.text.clone());
                entry.section("Вывод", display(&item["aggregated_output"]));
                if !item["exit_code"].is_null() {
                    entry.section("Код выхода", display(&item["exit_code"]));
                }
                entry.details = format!(
                    "{}\n\n{}\nКод выхода: {}",
                    entry.text,
                    display(&item["aggregated_output"]),
                    display(&item["exit_code"])
                );
                if item["exit_code"].as_i64().is_some_and(|code| code != 0) {
                    entry.status = "failed".into();
                }
            }
            "web_search" => {
                entry.title = "Ищет в интернете".into();
                entry.text = display(&item["query"]);
                entry.details = display(&item["action"]);
                entry.section("Поиск", entry.text.clone());
                entry.section("Действие", readable(&item["action"]));
            }
            "file_change" => {
                entry.title = "Изменяет файлы".into();
                entry.text = item["changes"]
                    .as_array()
                    .map(|changes| {
                        changes
                            .iter()
                            .map(|c| format!("{} {}", display(&c["kind"]), display(&c["path"])))
                            .collect::<Vec<_>>()
                            .join(" · ")
                    })
                    .unwrap_or_default();
                entry.details = display(&item["changes"]);
                entry.section("Файлы", readable(&item["changes"]));
            }
            "todo_list" => {
                entry.kind = "plan".into();
                entry.title = "План работы".into();
                entry.text = item["items"]
                    .as_array()
                    .map(|items| {
                        items
                            .iter()
                            .map(|i| {
                                format!(
                                    "{} {}",
                                    if i["completed"] == true { "✓" } else { "○" },
                                    display(&i["text"])
                                )
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default();
            }
            "error" => {
                entry.kind = "system".into();
                entry.title = "Ошибка Codex".into();
                entry.text = display(&item["message"]);
                entry.status = "failed".into();
            }
            _ => {
                // Unknown/new tool types still get a readable, expandable row.
                entry.title = item_type.replace('_', " ");
                entry.text = item
                    .get("tool")
                    .or_else(|| item.get("name"))
                    .map(display)
                    .unwrap_or_default();
                entry.details = display(item);
            }
        }
        entry.title = excerpt(&entry.title, 160);
        entry.text = excerpt(&entry.text, 8_000);
        entry.details = excerpt(&entry.details, 8_000);
        Some(entry.for_display().into_owned())
    }
}

fn decoded(value: &Value) -> Value {
    value
        .as_str()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| value.clone())
}

fn field_label(key: &str) -> String {
    match key {
        "query" => "Поиск",
        "text" => "Текст",
        "id" => "ID",
        "limit" => "Лимит",
        "set_id" => "Набор",
        "allowed_sets" => "Разрешённые наборы",
        "deck_id" => "Колода",
        "seed" => "Раздача",
        "squad_indices" => "Позиции в отряде",
        "cards" => "Карты",
        "changes" => "Изменения состава",
        "count" => "Количество",
        "name" => "Название",
        "description" => "Идея колоды",
        "how_to_play" => "План игры",
        "improvements" => "Улучшения",
        "owned_only" => "Только из коллекции",
        "include_editions" => "Включая издания",
        "max_cost" => "Максимальная стоимость",
        "color" | "colors" => "Стихии",
        "rarity" => "Редкость",
        "cost" => "Стоимость",
        "rules" => "Правила",
        "total" => "Всего найдено",
        "offset" => "Пропущено",
        "next_offset" => "Следующая страница с позиции",
        "owned" => "В коллекции",
        "owned_exact_edition" => "В коллекции (это издание)",
        "base_id" => "Базовая карта",
        "set" => "Набор",
        "edition" => "Издание",
        "foil" => "Фольга",
        "elite" => "Элитная",
        "unique" => "Уникальная",
        "type" => "Тип",
        "classes" => "Классы",
        "life" => "Здоровье",
        "move" => "Движение",
        "hit" => "Простой удар",
        "banned" => "Запрещена",
        "warnings" => "Предупреждения",
        "errors" => "Ошибки",
        "valid" => "Проверка пройдена",
        "saved" => "Сохранено",
        "message" => "Сообщение",
        "url" | "source_url" => "Источник",
        "sources" => "Источники",
        "format" => "Формат",
        "min_players" => "Минимум участников",
        "players" => "Участников",
        "from" => "С даты",
        "to" => "По дату",
        "page" => "Страница",
        "deck_urls" => "Турнирные колоды",
        "placement" => "Место",
        "lesson" => "Полезный опыт",
        "applicability" => "Когда применять",
        "insights" => "Сохранённый опыт",
        "sample_decks" => "Колод в выборке",
        "sample_events" => "Турниров в выборке",
        _ => return key.replace('_', " "),
    }
    .into()
}

/// Readable, bounded fields rather than JSON punctuation or MCP envelopes.
fn readable(value: &Value) -> String {
    fn lines(value: &Value, depth: usize) -> String {
        if depth >= 5 {
            return "… [подробнее в технических данных]".into();
        }
        let indent = "  ".repeat(depth + 1);
        match value {
            Value::Null => String::new(),
            Value::Bool(value) => if *value { "Да" } else { "Нет" }.into(),
            Value::String(text) => excerpt(text, 1_000),
            Value::Array(items) => {
                if items.is_empty() {
                    return "Нет".into();
                }
                let mut rows: Vec<_> = items
                    .iter()
                    .take(10)
                    .map(|item| format!("• {}", lines(item, depth + 1)))
                    .collect();
                if items.len() > 10 {
                    rows.push(format!("… ещё {}", items.len() - 10));
                }
                rows.join(&format!("\n{indent}"))
            }
            Value::Object(fields) => {
                let mut visible: Vec<_> = fields
                    .iter()
                    .filter(|(key, value)| {
                        !value.is_null()
                            && !matches!(key.as_str(), "expected_revision" | "revision")
                    })
                    .collect();
                visible.sort_by_key(|(key, _)| match key.as_str() {
                    "name" | "total" | "message" | "errors" | "warnings" => 0,
                    "cards" => 2,
                    _ => 1,
                });
                let mut rows: Vec<_> = visible
                    .iter()
                    .take(20)
                    .map(|(key, value)| {
                        let label = field_label(key);
                        let text = if key.as_str() == "cards"
                            && value.as_array().is_some_and(|items| {
                                !items.is_empty()
                                    && items.iter().all(|item| item["name"].is_string())
                            }) {
                            let items = value.as_array().unwrap();
                            let mut rows = items
                                .iter()
                                .take(10)
                                .map(|card| {
                                    let mut text = format!(
                                        "• {}",
                                        excerpt(card["name"].as_str().unwrap(), 120)
                                    );
                                    for field in ["id", "count", "cost"] {
                                        if !card[field].is_null() {
                                            text.push_str(&format!(
                                                " · {}: {}",
                                                field_label(field),
                                                excerpt(&display(&card[field]), 80)
                                            ));
                                        }
                                    }
                                    text
                                })
                                .collect::<Vec<_>>();
                            if items.len() > 10 {
                                rows.push(format!("… ещё {}", items.len() - 10));
                            }
                            rows.join(&format!("\n{indent}"))
                        } else {
                            lines(value, depth + 1)
                        };
                        if value.is_object() || value.is_array() {
                            format!("{label}:\n{indent}{text}")
                        } else {
                            format!("{label}: {text}")
                        }
                    })
                    .collect();
                if visible.len() > 20 {
                    rows.push(format!("… ещё {} полей", visible.len() - 20));
                }
                rows.join(&format!("\n{}", "  ".repeat(depth)))
            }
            _ => value.to_string(),
        }
    }
    excerpt(&lines(value, 0), 4_000)
}

fn result_text(value: &Value) -> String {
    let value = decoded(value);
    // Structured MCP replies often repeat the same JSON in a text block.
    for key in ["structuredContent", "structured_content"] {
        if let Some(content) = value.get(key).filter(|v| !v.is_null()) {
            return readable(&decoded(content));
        }
    }
    if let Some(blocks) = value["content"].as_array() {
        let mut text = blocks
            .iter()
            .take(10)
            .map(|block| match block["type"].as_str().unwrap_or("") {
                "text" => readable(&decoded(&block["text"])),
                "image" => "Изображение (технические данные доступны ниже)".into(),
                "audio" => "Аудио (технические данные доступны ниже)".into(),
                "resource" => {
                    if let Some(text) = block["resource"]["text"].as_str() {
                        readable(&decoded(&Value::String(text.into())))
                    } else {
                        "Ресурс (технические данные доступны ниже)".into()
                    }
                }
                "resource_link" => {
                    format!("{}\n{}", display(&block["name"]), display(&block["uri"]))
                }
                _ => "Содержимое (технические данные доступны ниже)".into(),
            })
            .collect::<Vec<String>>()
            .join("\n\n");
        if blocks.len() > 10 {
            text.push_str(&format!("\n… ещё {} блоков", blocks.len() - 10));
        }
        return excerpt(&text, 4_000);
    }
    readable(&value)
}

fn argument_summary(value: &Value) -> String {
    let value = decoded(value);
    let Some(args) = value.as_object() else {
        return excerpt(&display(&value), 240);
    };
    let mut fields: Vec<_> = args
        .iter()
        .filter(|(key, value)| {
            key.as_str() != "expected_revision" && !value.is_null() && value.as_str() != Some("")
        })
        .collect();
    fields.sort_by_key(|(key, _)| match key.as_str() {
        "query" | "id" | "name" | "cards" | "changes" => 0,
        "limit" | "offset" => 2,
        _ => 1,
    });
    fields
        .into_iter()
        .map(|(key, value)| {
            let label = if key == "id" {
                "карта".into()
            } else {
                field_label(key).to_lowercase()
            };
            let text = if let Some(items) = value.as_array() {
                if items.is_empty() {
                    "нет".into()
                } else if items.iter().all(|v| !v.is_object() && !v.is_array()) {
                    let mut text = items
                        .iter()
                        .take(6)
                        .map(display)
                        .collect::<Vec<_>>()
                        .join(", ");
                    if items.len() > 6 {
                        text.push_str(&format!(" … ещё {}", items.len() - 6));
                    }
                    text
                } else {
                    format!("{} поз.", items.len())
                }
            } else {
                readable(value)
            };
            format!("{label}: {}", excerpt(&text, 80))
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

impl Chat {
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty() && self.omitted == 0
    }

    pub fn within_limits(&self) -> bool {
        self.entries.len() <= 256
            && serde_json::to_vec(&self.entries).is_ok_and(|v| v.len() <= 900_000)
    }

    /// Restore saved entries before appending newer activity, updating matching IDs.
    pub fn merge(&mut self, newer: &Self) {
        self.omitted = self.omitted.max(newer.omitted);
        for entry in &newer.entries {
            self.upsert(entry.clone());
        }
    }

    pub fn upsert(&mut self, entry: Entry) {
        if let Some(old) = self.entries.iter_mut().find(|old| old.id == entry.id) {
            *old = entry;
        } else {
            self.entries.push(entry);
        }
        // Stay below the bridge frame limit even with JSON escaping. Tell the
        // user when old history is evicted instead of silently losing activity.
        while self.entries.len() > 256
            || serde_json::to_vec(&self.entries).is_ok_and(|v| v.len() > 900_000)
        {
            self.entries.remove(0);
            self.omitted += 1;
        }
    }
    pub fn finish(&mut self, phase: &str) {
        for entry in &mut self.entries {
            if entry.status == "in_progress" {
                entry.status = if phase == "succeeded" {
                    "completed"
                } else {
                    "cancelled"
                }
                .into();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn managed_approval_fallback_is_a_notice_but_failures_remain_errors() {
        let message = "Configured value for `approval_policy` is disallowed by requirements; falling back to required value UnlessTrusted. Details: invalid value for `approval_policy`: `Never` is not in the allowed set [UnlessTrusted, OnRequest] (set by MDM com.openai.codex:requirements_toml_base64)";
        let event = json!({"type":"item.completed", "item":{
            "id":"item_0", "type":"error", "message":message
        }});
        let notice = Entry::from_event(&event, "run").unwrap();
        assert_eq!(notice.kind, "notice");
        assert_eq!(notice.status_label(), "Уведомление");
        assert!(notice.compact());
        assert_eq!(notice.details, message);
        let mut legacy = Entry::message("run:item_0".into(), "system", "Ошибка Codex", message);
        legacy.status = "failed".into();
        assert_eq!(legacy.for_display().as_ref(), &notice);
        assert_eq!(
            legacy.status, "failed",
            "display must not change saved revisions"
        );
        for failure in [
            json!({"type":"turn.failed", "error":{"message":message}}),
            json!({"type":"error", "message":message}),
            json!({"type":"item.completed", "item":{"id":"item_1", "type":"error", "message":"MCP tool call cancelled: interactive approval is unavailable in exec mode"}}),
            json!({"type":"item.completed", "item":{"id":"item_2", "type":"error", "message":message.replace("UnlessTrusted.", "Never.")}}),
        ] {
            let error = Entry::from_event(&failure, "run").unwrap();
            assert_eq!(error.for_display().status, "failed");
        }
    }

    #[test]
    fn tool_lifecycle_keeps_one_row_with_readable_arguments_and_errors() {
        let mut chat = Chat::default();
        let mut event = json!({"type":"item.started", "item":{
            "id":"tool-1", "type":"mcp_tool_call", "server":"berserk_catalog",
            "tool":"search_cards", "arguments":{"query":"лес", "limit":10}, "status":"in_progress"
        }});
        chat.upsert(Entry::from_event(&event, "run-1").unwrap());
        assert_eq!(chat.entries[0].title, "Ищет карты");
        assert!(chat.entries[0].text.contains("поиск: лес"));
        event["type"] = json!("item.completed");
        event["item"]["status"] = json!("completed");
        event["item"]["result"] =
            json!({"isError":true, "content":[{"type":"text","text":"Unknown set"}]});
        chat.upsert(Entry::from_event(&event, "run-1").unwrap());
        assert_eq!(chat.entries.len(), 1);
        assert_eq!(chat.entries[0].status, "failed");
        assert!(chat.entries[0].details.contains("Unknown set"));
        assert!(
            chat.entries[0]
                .sections
                .iter()
                .any(|s| s.title == "Результат" && s.text == "Unknown set")
        );
        chat.upsert(Entry::from_event(&event, "run-2").unwrap());
        assert_eq!(chat.entries.len(), 2, "resumed runs can reuse CLI item IDs");
    }

    #[test]
    fn mcp_results_decode_text_and_deduplicate_structured_content() {
        let cards = json!({"total": 1, "cards": [{"id": "80010", "name": "Страж леса"}]});
        let text_result = json!({"content": [{"type": "text", "text": cards.to_string()}]});
        let structured_result = json!({
            "structuredContent": cards,
            "content": [{"type": "text", "text": cards.to_string()}]
        });
        let readable = result_text(&text_result);
        assert_eq!(readable, result_text(&structured_result));
        assert!(readable.contains("Всего найдено: 1"));
        assert!(readable.contains("• Страж леса · ID: 80010"));
        assert_eq!(readable.matches("Страж леса").count(), 1);
        assert!(!readable.contains("\"cards\""));
        assert_eq!(
            result_text(&json!({"content": [{"type":"text", "text":"No connection"}]})),
            "No connection"
        );
    }

    #[test]
    fn arguments_prioritize_intent_and_preserve_short_lists_and_booleans() {
        let args = json!({"query":"лес", "allowed_sets":[7,8], "owned_only":true,
            "limit":10, "expected_revision":"private-revision", "max_cost":null});
        let summary = argument_summary(&json!(args.to_string()));
        assert!(summary.starts_with("поиск: лес"));
        assert!(summary.contains("разрешённые наборы: 7, 8"));
        assert!(summary.contains("только из коллекции: Да"));
        assert!(!summary.contains("private-revision"));
        assert!(!summary.contains("null"));
        assert!(readable(&args).contains("Только из коллекции: Да"));
        assert!(!readable(&args).contains("private-revision"));
    }

    #[test]
    fn rich_details_are_bounded_and_binary_blocks_are_not_rendered_as_text() {
        let result = json!({"content":[
            {"type":"text", "text":"Найдено изображение"},
            {"type":"image", "data":"BASE64_PAYLOAD", "mimeType":"image/png"}
        ]});
        assert!(result_text(&result).contains("Найдено изображение"));
        assert!(result_text(&result).contains("Изображение"));
        assert!(!result_text(&result).contains("BASE64_PAYLOAD"));
        assert!(readable(&json!((0..30).collect::<Vec<_>>())).contains("ещё 20"));
        let event = json!({"type":"item.completed", "item": {
            "id":"large", "type":"mcp_tool_call", "tool":"search_cards",
            "arguments":{"query":"я".repeat(10_000)},
            "result":{"content":[{"type":"text", "text":"я".repeat(10_000)}]}
        }});
        let row = Entry::from_event(&event, "r").unwrap();
        assert!(row.sections.iter().all(|s| s.text.len() < 4_100));
        assert!(row.sections.iter().any(|s| s.text.contains("[сокращено]")));
    }

    #[test]
    fn saved_entries_without_sections_remain_compatible() {
        let legacy = json!({"id":"r:1", "kind":"tool", "title":"Ищет карты",
            "text":"поиск: лес", "details":"Old raw details", "status":"completed"});
        let entry: Entry = serde_json::from_value(legacy.clone()).unwrap();
        assert!(entry.sections.is_empty());
        assert_eq!(serde_json::to_value(entry).unwrap(), legacy);
    }

    #[test]
    fn projects_public_messages_reasoning_and_all_action_types() {
        for (kind, fields, label) in [
            (
                "reasoning",
                json!({"text":"Проверяю баланс"}),
                "Ход рассуждений",
            ),
            ("agent_message", json!({"text":"Подбираю карты"}), "Codex"),
            (
                "command_execution",
                json!({"command":"ls", "exit_code":1}),
                "Выполняет команду",
            ),
            ("web_search", json!({"query":"правила"}), "Ищет в интернете"),
            (
                "file_change",
                json!({"changes":[{"path":"deck.json","kind":"update"}]}),
                "Изменяет файлы",
            ),
            (
                "todo_list",
                json!({"items":[{"text":"Проверить колоду","completed":false}]}),
                "План работы",
            ),
            ("future_tool", json!({"name":"new action"}), "future tool"),
        ] {
            let mut item = fields;
            item["id"] = json!("1");
            item["type"] = json!(kind);
            let row =
                Entry::from_event(&json!({"type":"item.completed","item":item}), "r").unwrap();
            assert_eq!(row.title, label);
            assert!(!row.text.is_empty());
        }
        assert!(Entry::from_event(&json!({"type":"thread.started"}), "r").is_none());
        assert!(
            Entry::from_event(
                &json!({"type":"item.started","item":{"type":"mcp_tool_call"}}),
                "r"
            )
            .is_none()
        );
        let error = Entry::from_event(
            &json!({"type":"turn.failed","error":{"message":"No connection"}}),
            "r",
        )
        .unwrap();
        assert_eq!(error.status, "failed");
        assert_eq!(error.text, "No connection");
    }

    #[test]
    fn transcript_is_bounded_and_marks_interrupted_actions() {
        let mut chat = Chat::default();
        for i in 0..300 {
            let mut row = Entry::message(i.to_string(), "tool", "Инструмент", &"я".repeat(8_000));
            row.status = "in_progress".into();
            chat.upsert(row);
        }
        assert!(chat.omitted > 0);
        assert!(serde_json::to_vec(&chat).unwrap().len() < 1_000_000);
        assert!(chat.entries[0].text.ends_with("[сокращено]"));
        chat.finish("cancelled");
        assert!(chat.entries.iter().all(|e| e.status == "cancelled"));
    }

    #[test]
    fn legacy_progress_and_structured_deck_answers_stay_readable() {
        let progress: crate::agent::BuildProgress = serde_json::from_value(json!({
            "request_id":"old", "phase":"running", "message":"Working", "deck_id":null
        }))
        .unwrap();
        assert!(progress.chat.entries.is_empty());
        let text = json!({"status":"ready","name":"Лес","explanation":"Готово","description":"Быстрый отряд","cards":[{"id":"123","count":3}]}).to_string();
        let row = Entry::from_event(
            &json!({"type":"item.completed","item":{"id":"a","type":"agent_message","text":text}}),
            "r",
        )
        .unwrap();
        assert!(row.text.contains("Быстрый отряд"));
        assert!(!row.text.contains("123"));
    }
}

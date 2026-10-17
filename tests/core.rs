use berserk_leptos::{formats::*, model::*, shuffle::Rng};
use std::{collections::BTreeSet, path::Path};
fn cat() -> Catalog {
    Catalog::load().unwrap()
}
#[test]
fn bundled_catalog_has_complete_artwork() {
    let c = cat();
    assert_eq!(c.cards.iter().filter(|x| x.alt.is_empty()).count(), 1750);
    assert_eq!(c.constants.sets.len(), 10);
    let mut ids = BTreeSet::new();
    let mut missing = vec![];
    for card in &c.cards {
        assert!(ids.insert(&card.id));
        assert!(c.get(&card.id).is_some());
        if !Path::new(&c.image(card)).exists() {
            missing.push(c.image(card));
        }
    }
    assert!(missing.is_empty(), "Missing artwork: {missing:?}");
}
#[test]
fn search_combines_terms_and_normalizes_russian() {
    let c = cat();
    let u = UserData::default();
    let f = Filter {
        query: "КОЧЕВНИК".into(),
        set: "10".into(),
        ..Default::default()
    };
    assert!(f.apply(&c, &u).iter().any(|x| x.id == "10001"));
    assert_eq!(normalize("ЁжЁ"), "еже");
    let f = Filter {
        query: "кочевник несуществующееслово".into(),
        ..f
    };
    assert!(f.apply(&c, &u).is_empty());
}
#[test]
fn ownership_favorites_variants_and_rotation_filters() {
    let c = cat();
    let mut u = UserData::default();
    u.set_count("10001", 2);
    u.favorites.insert("10001".into());
    let f = Filter {
        owned: "owned".into(),
        favorites: true,
        ..Default::default()
    };
    assert_eq!(f.apply(&c, &u).len(), 1);
    assert!(
        Filter {
            standard: true,
            ..f
        }
        .apply(&c, &u)
        .is_empty()
    );
    let base = Filter {
        edition: EditionFilter::Base,
        ..Default::default()
    }
    .apply(&c, &u)
    .len();
    assert!(
        Filter {
            edition: EditionFilter::All,
            ..Default::default()
        }
        .apply(&c, &u)
        .len()
            > base
    );
}
#[test]
fn counts_can_be_zero_without_losing_variant_data() {
    let mut u = UserData::default();
    u.set_count("10001", 3);
    u.collection
        .get_mut("10001")
        .unwrap()
        .count
        .insert("t1".into(), 1);
    u.set_count("10001", 0);
    assert_eq!(u.total(), 0);
    assert_eq!(u.collection["10001"].count["t1"], 1);
}
#[test]
fn deck_text_roundtrips_names_and_ids_with_sideboard() {
    let c = cat();
    let mut d = Deck::new("test".into(), "Моя колода".into());
    d.cards = vec!["10001".into(), "10001".into(), "70001".into()];
    d.side = vec!["70220".into()];
    d.improvements = "Добавить карту вне коллекции\nЗаменить слабое звено".into();
    d.description = "Идея: ядро и поддержка\nВторая строка".into();
    d.how_to_play = "Первый ход\n# Не название\n---side---".into();
    for names in [true, false] {
        let parsed = read_deck(&write_deck(&d, &c, names), &c, "test".into()).unwrap();
        assert_eq!(parsed, d);
    }
}
#[test]
fn deck_import_reports_unknown_cards_and_invalid_counts() {
    let c = cat();
    for text in [
        "3 НЕТ ТАКОЙ КАРТЫ",
        "-2 Кочевник",
        "100000 10001",
        "2 99999",
        "# just title",
    ] {
        assert!(read_deck(text, &c, "test".into()).is_err(), "{text}");
    }
}
#[test]
fn collections_roundtrip_variants_costs_and_whitespace() {
    let c = cat();
    let input = "#comment\n10001 4 t1:2 ua:1 = 125 t1:70\n\n70001\t3\n10001 2";
    let data = read_collection(input, &c).unwrap();
    assert_eq!(data["10001"].count[""], 6);
    assert_eq!(data["10001"].costs["t1"], 70);
    assert_eq!(read_collection(&write_collection(&data), &c).unwrap(), data);
}
#[test]
fn imports_actual_upstream_brsc_export_without_losing_editions_or_metadata() {
    let c = cat();
    let input = include_str!("fixtures/upstream-collection.brsc");
    let expected = serde_json::from_str::<std::collections::BTreeMap<String, CollectionEntry>>(
        include_str!("fixtures/upstream-collection.json"),
    )
    .unwrap();
    for text in [
        input.to_string(),
        format!("\u{feff}{}\r\n", input.replace('\n', "\r\n")),
    ] {
        let imported = read_collection(&text, &c).unwrap();
        assert_eq!(imported, expected);
        assert_eq!(
            read_collection(&write_collection(&imported), &c).unwrap(),
            expected
        );
        let user = UserData {
            collection: imported,
            ..Default::default()
        };
        assert_eq!(user.total(), 17);
        let owned = Filter {
            owned: "owned".into(),
            ..Default::default()
        };
        assert_eq!(
            owned.apply(&c, &user).len(),
            11,
            "All imported editions must be visible by default"
        );
        let foils = Filter {
            edition: EditionFilter::Foil,
            ..owned
        };
        assert_eq!(foils.apply(&c, &user).len(), 7);
        assert_eq!(
            foils
                .apply(&c, &user)
                .iter()
                .map(|card| user.count(&card.id))
                .sum::<u32>(),
            8
        );
    }
}
#[test]
fn foil_filter_includes_each_finish_but_not_nonfoil_full_art() {
    let c = cat();
    for id in [
        "10176f",
        "10036altf",
        "30096alt_2f",
        "50161fpf",
        "30031altfpf",
        "50036of",
        "50217altof",
    ] {
        assert!(EditionFilter::Foil.matches(c.get(id).unwrap()), "{id}");
    }
    for id in ["10176", "10007pf", "20030altpf"] {
        assert!(!EditionFilter::Foil.matches(c.get(id).unwrap()), "{id}");
    }
    let mut user = UserData::default();
    user.set_count("10176", 3);
    user.set_count("10176f", 2);
    user.set_count("10176f", 5);
    assert_eq!(user.count("10176"), 3);
    assert_eq!(user.total(), 8);
    assert_eq!(
        c.image(c.get("10176f").unwrap()),
        c.image(c.get("10176").unwrap())
    );
    assert!(
        Filter {
            query: "10176f".into(),
            ..Default::default()
        }
        .apply(&c, &user)
        .iter()
        .any(|x| x.id == "10176f")
    );
    assert_eq!(
        Filter {
            edition: EditionFilter::Foil,
            ..Default::default()
        }
        .apply(&c, &user)
        .len(),
        580
    );
}
#[test]
fn collection_invalid_input_is_rejected() {
    let c = cat();
    for s in [
        "10001 -1",
        "10001 3 broken",
        "10001 3 =",
        "999999 2",
        "10001 4294967295\n10001 1",
    ] {
        assert!(read_collection(s, &c).is_err(), "{s}");
    }
}
#[test]
fn compact_matches_upstream_encoding_and_handles_over_seven_copies() {
    let c = cat();
    let mut d = Deck::new("x".into(), "x".into());
    d.cards = vec!["10001".into(); 9];
    d.side = vec!["70220".into(); 2];
    assert_eq!(&write_compact(&d, &c)[..4], "#4AB");
    let p = read_compact(&write_compact(&d, &c), &c, "x".into()).unwrap();
    assert_eq!(p.cards, d.cards);
    assert_eq!(p.side, d.side);
    for s in ["#", "#abc!", "#!!!", "#AAA", "#ффф"] {
        assert!(read_compact(s, &c, "x".into()).is_err());
    }
}
#[test]
fn deck_remove_and_move_preserve_duplicates() {
    let mut d = Deck::new("x".into(), "x".into());
    d.add("10001", false);
    d.add("10001", false);
    d.remove("10001", false);
    d.add("10001", true);
    assert_eq!(d.cards.len(), 1);
    assert_eq!(d.side.len(), 1);
    d.remove("other", false);
    assert_eq!(d.cards.len(), 1);
}
#[test]
fn budget_pays_elite_in_gold_and_common_with_silver_first() {
    let c = cat();
    let ids = vec!["10001".into(); 8];
    assert_eq!(squad_budget(&ids, &c, false, 0), (22, 0));
    assert_eq!(squad_budget(&ids, &c, true, 1), (23, 0));
    let elite = &c.cards.iter().find(|c| c.elite).unwrap().id;
    let budget = squad_budget(std::slice::from_ref(elite), &c, false, 0);
    assert_eq!(budget, (24 - i32::from(c.get(elite).unwrap().cost), 22));
}
#[test]
fn squad_limits_apply_across_alternate_art() {
    let c = cat();
    let base = c
        .cards
        .iter()
        .find(|c| c.uniq && !c.alts.is_empty())
        .unwrap();
    let ids = vec![base.id.clone(), format!("{}{}", base.id, base.alts[0])];
    assert!(
        squad_issues(&ids, &c)
            .iter()
            .any(|s| s.contains("максимум 1"))
    );
}
#[test]
fn backup_roundtrip_and_validation() {
    let c = cat();
    let mut u = UserData::default();
    u.set_count("10001", 2);
    let parsed: UserData = serde_json::from_str(&serde_json::to_string(&u).unwrap()).unwrap();
    assert_eq!(parsed, u);
    parsed.validate(&c).unwrap();
    u.version = 2;
    assert!(u.validate(&c).is_err());
}

#[test]
fn tts_roundtrip_preserves_sideboard_and_alt_ids() {
    let c = cat();
    let mut d = Deck::new("x".into(), "Колода TTS".into());
    d.description = "Синергии".into();
    d.improvements = "Приобрести недостающие карты\nПо приоритету".into();
    d.how_to_play = "Первый ход\nЗащита".into();
    let alt = c
        .cards
        .iter()
        .find(|x| !x.alt.is_empty())
        .unwrap()
        .id
        .clone();
    d.cards = vec!["10001".into(), "10001".into(), alt];
    d.side = vec!["70220".into()];
    let text = write_tts(&d, &c).unwrap();
    let parsed = read_tts(&text, &c, "x".into()).unwrap();
    assert_eq!(parsed.cards, d.cards);
    assert_eq!(parsed.side, d.side);
    assert_eq!(parsed.name, d.name);
    assert_eq!(parsed.description, d.description);
    assert_eq!(parsed.how_to_play, d.how_to_play);
    assert_eq!(parsed.improvements, d.improvements);
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(
        value["ObjectStates"][0]["DeckIDs"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    assert!(read_tts("{}", &c, "x".into()).is_err());
}
#[test]
fn all_base_card_names_can_be_reimported() {
    let c = cat();
    for card in c.cards.iter().filter(|c| c.alt.is_empty()) {
        let input = format!("1 {}", card.name);
        let d = read_deck(&input, &c, "x".into()).unwrap_or_else(|e| panic!("{}: {e}", card.name));
        assert_eq!(
            normalize(c.get(&d.cards[0]).unwrap().name.trim()),
            normalize(card.name.trim())
        );
    }
}

#[test]
fn base_and_alt_bans_are_applied_independently() {
    let c = cat();
    assert_eq!(c.get("20100").unwrap().ban, true);
    assert_eq!(c.get("10039").unwrap().ban, false);
    assert_eq!(c.get("10039alt").unwrap().ban, true);
    assert!(
        squad_issues(&["20100".into()], &c)
            .iter()
            .any(|s| s.contains("запрещена"))
    );
}

#[test]
fn removed_draft_state_does_not_block_old_saves_or_disappear_from_backups() {
    let input = r#"{"version":1,"collection":{"10176f":{"count":{"":2}}},"draft":{"old_state":true,"packs":[]}}"#;
    let mut user: UserData = serde_json::from_str(input).unwrap();
    user.validate(&cat()).unwrap();
    assert_eq!(user.count("10176f"), 2);
    user.set_count("10176f", 3);
    let saved: serde_json::Value =
        serde_json::from_str(&serde_json::to_string(&user).unwrap()).unwrap();
    assert_eq!(
        saved["draft"],
        serde_json::json!({"old_state":true,"packs":[]})
    );
    assert!(
        serde_json::to_value(UserData::default())
            .unwrap()
            .get("draft")
            .is_none()
    );
}
#[test]
fn hand_shuffle_is_reproducible_and_preserves_cards() {
    let cards = (0..30).collect::<Vec<_>>();
    let mut first = cards.clone();
    let mut second = cards.clone();
    Rng::new(42).shuffle(&mut first);
    Rng::new(42).shuffle(&mut second);
    assert_eq!(first, second);
    assert_ne!(first, cards);
    first.sort();
    assert_eq!(first, cards);
    Rng::new(0).shuffle(&mut Vec::<u8>::new());
}

#[test]
fn heart_of_swarm_has_complete_cards_editions_and_readable_rules() {
    let c = cat();
    assert_eq!(c.set_name(80), "Сердце роя");
    let cards: Vec<_> = c.cards.iter().filter(|card| card.set_id == 80).collect();
    assert_eq!(cards.len(), 354);
    assert_eq!(cards.iter().filter(|card| card.alt.is_empty()).count(), 220);
    assert_eq!(cards.iter().filter(|card| card.is_foil()).count(), 90);
    assert_eq!(cards.iter().filter(|card| card.uses_base_art()).count(), 61);
    for card in cards {
        assert!(!card.art.is_empty());
        assert!(
            !c.rules_text(card).contains('{'),
            "Unknown icon on {}",
            card.id
        );
    }
    assert_eq!(c.get("80078").unwrap().name, "Алирра");
    assert_eq!(c.get("80120").unwrap().name, "Менгир Каррефура");
    assert!(c.get("80011n").unwrap().is_foil());
    assert!(c.get("80011n").unwrap().uses_base_art());
    assert!(!c.get("80001f").unwrap().uses_base_art());
    assert!(
        !Filter {
            set: "80".into(),
            query: "кровожадность".into(),
            ..Default::default()
        }
        .apply(&c, &UserData::default())
        .is_empty()
    );
}

#[test]
fn heart_of_swarm_is_usable_in_collections_decks_and_compact_codes() {
    let c = cat();
    let collection = read_collection("80001 2\n80001f 1\n80011n 1\n80003altn 1", &c).unwrap();
    let user = UserData {
        collection,
        ..Default::default()
    };
    user.validate(&c).unwrap();
    assert_eq!(user.total(), 5);
    assert_eq!(
        read_collection(&write_collection(&user.collection), &c).unwrap(),
        user.collection
    );
    let mut deck = Deck::new("new-set".into(), "Сердце роя".into());
    deck.cards = vec!["80001".into(), "80220".into()];
    let decoded = read_compact(&write_compact(&deck, &c), &c, "new-set".into()).unwrap();
    assert_eq!(decoded.cards, deck.cards);
    assert_eq!(
        read_deck(&write_deck(&deck, &c, false), &c, "new-set".into()).unwrap(),
        deck
    );
    assert!(write_tts(&deck, &c).unwrap_err().contains("атласов"));
}

#[test]
fn legacy_decks_default_notes_and_backups_preserve_new_fields() {
    let old = r#"{"id":"legacy","name":"Старая колода","cards":["10001"]}"#;
    let mut deck: Deck = serde_json::from_str(old).unwrap();
    assert!(
        deck.description.is_empty() && deck.how_to_play.is_empty() && deck.improvements.is_empty()
    );
    deck.description = "Описание".into();
    deck.improvements = "Приобрести карту\nЗаменить поддержку".into();
    deck.how_to_play = "Набор отряда\nПервые ходы".into();
    let user = UserData {
        decks: vec![deck.clone()],
        ..Default::default()
    };
    let restored: UserData = serde_json::from_str(&serde_json::to_string(&user).unwrap()).unwrap();
    assert_eq!(restored.decks, vec![deck]);
}

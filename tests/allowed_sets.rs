use berserk_leptos::{agent::*, deck_prompt::*, formats, model::*};

fn restricted_deck() -> Deck {
    let mut deck = Deck::new("sets-test".into(), "Наборы".into());
    deck.allowed_sets = Some(vec![80]);
    deck.cards = vec!["80001".into(), "80001f".into()];
    deck
}

#[test]
fn legacy_decks_remain_unrestricted_and_explicit_lists_are_validated() {
    let cat = Catalog::load().unwrap();
    let legacy: Deck =
        serde_json::from_str(r#"{"id":"old","name":"Old","cards":["10001","80001"]}"#).unwrap();
    assert_eq!(legacy.allowed_sets, None);
    assert!(legacy.validate_sets(&cat).is_ok());
    let mut deck = restricted_deck();
    assert!(deck.validate_sets(&cat).is_ok());
    for sets in [vec![], vec![9999], vec![80, 80]] {
        deck.allowed_sets = Some(sets);
        assert!(deck.validate_sets(&cat).is_err());
    }
}

#[test]
fn main_side_save_and_backup_cannot_bypass_restriction() {
    let cat = Catalog::load().unwrap();
    for side in [false, true] {
        let mut deck = restricted_deck();
        deck.add("10001", side);
        assert!(validate_shape(&deck, &cat).is_err());
        assert_eq!(
            deck_report(&deck, &cat, None)["basic_constructed_ok"],
            false
        );
        let mut user = UserData::default();
        assert!(
            apply_command(
                &mut user,
                &cat,
                BrowserCommand::SaveDeck {
                    deck: deck.clone(),
                    expected_revision: None,
                    check_collection: false,
                }
            )
            .is_err()
        );
        assert!(user.decks.is_empty());
        user.decks.push(deck);
        assert!(user.validate(&cat).is_err());
    }
    let original = restricted_deck();
    let mut changed = original.clone();
    changed.allowed_sets = Some(vec![10]);
    assert!(changed.validate_sets(&cat).is_err());
    assert_ne!(revision(&original), revision(&changed));
}

#[test]
fn settings_survive_portable_formats_and_invalid_imports_fail() {
    let cat = Catalog::load().unwrap();
    let mut deck = restricted_deck();
    deck.side.push("80002".into());
    let text = formats::write_deck(&deck, &cat, false);
    let imported = formats::read_deck(&text, &cat, deck.id.clone()).unwrap();
    assert_eq!(imported.allowed_sets, deck.allowed_sets);
    assert_eq!(imported.cards, deck.cards);
    assert_eq!(imported.side, deck.side);
    assert!(formats::read_deck(&format!("{text}\n1 10001"), &cat, "bad".into()).is_err());
    let tts_deck = Deck {
        cards: vec!["10001".into()],
        side: vec!["10002".into()],
        allowed_sets: Some(vec![10]),
        ..deck.clone()
    };
    let tts = formats::write_tts(&tts_deck, &cat).unwrap();
    let imported = formats::read_tts(&tts, &cat, deck.id.clone()).unwrap();
    assert_eq!(imported.allowed_sets, tts_deck.allowed_sets);
    assert_eq!(imported.cards, tts_deck.cards);
    let data = UserData {
        decks: vec![deck],
        ..Default::default()
    };
    let restored: UserData = serde_json::from_str(&serde_json::to_string(&data).unwrap()).unwrap();
    assert_eq!(restored, data);
    assert!(restored.validate(&cat).is_ok());
}

#[test]
fn scoped_catalog_excludes_disabled_records_and_metadata() {
    let cat = Catalog::load().unwrap();
    let scoped = cat.restricted(Some(&[80])).unwrap();
    assert_eq!(scoped.set_ids(), vec![80]);
    assert!(scoped.cards.iter().all(|c| c.set_id == 80));
    assert!(scoped.get("10001").is_none());
    assert_eq!(scoped.get("80001f").unwrap().id, "80001f");
    assert!(
        Filter {
            set: "10".into(),
            ..Default::default()
        }
        .apply(&scoped, &UserData::default())
        .is_empty()
    );
    assert!(scoped.restricted(Some(&[10])).is_err());
    assert!(cat.restricted(Some(&[])).is_err());
}

#[test]
fn both_prompts_limit_search_lookup_save_and_improvements() {
    for prompt in [
        deck_build_prompt(30, "any", Some(&[80])).unwrap(),
        local_deck_prompt(30, "any", "[]", Some(&[80])).unwrap(),
    ] {
        for expected in [
            "allowed_sets=[80]",
            "Не ищи карты отключённых наборов",
            "search_cards и get_card",
            "validate_deck и save_deck",
            "improvements",
        ] {
            assert!(prompt.contains(expected), "{expected}");
        }
        assert!(!prompt.contains("не ограничивайся одним сетом"));
    }
    assert!(deck_build_prompt(30, "", Some(&[])).is_err());
}

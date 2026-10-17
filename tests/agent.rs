use berserk_leptos::{agent::*, model::*};
use serde_json::json;

fn draft() -> Deck {
    let mut deck = Deck::new("agent-test".into(), "Agent draft".into());
    deck.cards = vec!["80001".into(), "80001f".into()];
    deck
}
#[test]
fn bridge_creates_and_updates_decks_without_touching_other_data() {
    let cat = Catalog::load().unwrap();
    let mut user = UserData::default();
    user.set_count("80001", 7);
    user.favorites.insert("80001".into());
    user.legacy_draft = Some(json!({"opaque":true}));
    let original = user.clone();
    let deck = draft();
    apply_command(
        &mut user,
        &cat,
        BrowserCommand::SaveDeck {
            check_collection: false,
            deck: deck.clone(),
            expected_revision: None,
        },
    )
    .unwrap();
    let mut changed = deck.clone();
    changed.name = "Updated".into();
    changed.description = "Synergy".into();
    changed.how_to_play = "Recruit, deploy, attack".into();
    changed.improvements = "Acquire another support card".into();
    apply_command(
        &mut user,
        &cat,
        BrowserCommand::SaveDeck {
            check_collection: false,
            deck: changed.clone(),
            expected_revision: Some(revision(&deck)),
        },
    )
    .unwrap();
    assert_eq!(user.decks, vec![changed]);
    assert_eq!(user.collection, original.collection);
    assert_eq!(user.favorites, original.favorites);
    assert_eq!(user.legacy_draft, original.legacy_draft);
}
#[test]
fn bridge_rejects_collisions_stale_revisions_and_deleted_decks_atomically() {
    let cat = Catalog::load().unwrap();
    let mut user = UserData {
        decks: vec![draft()],
        ..Default::default()
    };
    let old = revision(&user.decks[0]);
    user.decks[0].cards.push("80002".into());
    let before = user.clone();
    for expected in [None, Some(old)] {
        assert!(
            apply_command(
                &mut user,
                &cat,
                BrowserCommand::SaveDeck {
                    check_collection: false,
                    deck: draft(),
                    expected_revision: expected
                }
            )
            .is_err()
        );
        assert_eq!(user, before);
    }
    user.decks.clear();
    assert!(
        apply_command(
            &mut user,
            &cat,
            BrowserCommand::SaveDeck {
                check_collection: false,
                deck: draft(),
                expected_revision: Some(revision(&draft()))
            }
        )
        .is_err()
    );
    assert!(user.decks.is_empty());
}
#[test]
fn bridge_rejects_unknown_cards_and_oversized_payloads_without_changes() {
    let cat = Catalog::load().unwrap();
    let mut user = UserData::default();
    let mut invalid = draft();
    invalid.side.push("not-a-card".into());
    assert!(
        apply_command(
            &mut user,
            &cat,
            BrowserCommand::SaveDeck {
                check_collection: false,
                deck: invalid,
                expected_revision: None
            }
        )
        .is_err()
    );
    let mut large = draft();
    large.cards = vec!["80001".into(); 501];
    assert!(validate_shape(&large, &cat).is_err());
    assert_eq!(user, UserData::default());
}
#[test]
fn snapshot_shares_only_positive_quantities_not_prices_or_legacy_data() {
    let mut user = UserData::default();
    user.set_count("80001", 2);
    user.set_count("80002", 0);
    user.collection
        .get_mut("80001")
        .unwrap()
        .costs
        .insert("secret".into(), 99);
    user.legacy_draft = Some(json!({"private":"metadata"}));
    let value = serde_json::to_value(Snapshot::from(&user)).unwrap();
    assert_eq!(value, json!({"decks":[],"collection":{"80001":2}}));
}
#[test]
fn constructed_report_counts_variants_together_but_not_squad_uniqueness() {
    let cat = Catalog::load().unwrap();
    let mut deck = draft();
    deck.cards = vec!["80001".into(); 2];
    deck.cards.extend(vec!["80001f".into(); 2]);
    let report = deck_report(&deck, &cat, None);
    assert!(
        report["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v.as_str().unwrap().contains("4 copies"))
    );
    let unique = cat
        .cards
        .iter()
        .find(|c| c.uniq && c.alt.is_empty())
        .unwrap();
    deck.cards = vec![unique.id.clone(); 3];
    let report = deck_report(&deck, &cat, None);
    assert!(
        !report["issues"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v.as_str().unwrap().contains("copies"))
    );
}
#[test]
fn shortages_include_sideboard_and_keep_exact_editions_separate() {
    let cat = Catalog::load().unwrap();
    let mut deck = draft();
    deck.side = vec!["80001".into()];
    let owned = [("80001".into(), 1)].into_iter().collect();
    let report = deck_report(&deck, &cat, Some(&owned));
    assert_eq!(
        report["missing_exact_editions"].as_array().unwrap().len(),
        2
    );
    assert!(
        report["missing_exact_editions"]
            .as_array()
            .unwrap()
            .iter()
            .all(|v| v["missing"] == 1)
    );
}
#[test]
fn browser_contract_rejects_unknown_commands_and_extra_fields() {
    assert!(serde_json::from_value::<BrowserCommand>(json!({"action":"delete_all"})).is_err());
    assert!(
        serde_json::from_value::<BrowserCommand>(json!({"action":"snapshot","injected":true}))
            .is_err()
    );
}

#[test]
fn owned_only_save_checks_current_collection_including_sideboard() {
    let cat = Catalog::load().unwrap();
    let mut user = UserData::default();
    user.set_count("80001", 1);
    user.set_count("80001f", 1);
    let mut deck = draft();
    deck.side.push("80001".into());
    let before = user.clone();
    assert!(
        apply_command(
            &mut user,
            &cat,
            BrowserCommand::SaveDeck {
                deck: deck.clone(),
                expected_revision: None,
                check_collection: true,
            }
        )
        .unwrap_err()
        .contains("insufficient owned cards")
    );
    assert_eq!(user, before);
    user.set_count("80001", 2);
    apply_command(
        &mut user,
        &cat,
        BrowserCommand::SaveDeck {
            deck: deck.clone(),
            expected_revision: None,
            check_collection: true,
        },
    )
    .unwrap();
    assert_eq!(user.decks, vec![deck.clone()]);
    let old_revision = revision(&deck);
    deck.description = "Changed strategy".into();
    assert_ne!(revision(&deck), old_revision);
    let old_revision = revision(&deck);
    deck.improvements = "Buy an unowned card".into();
    assert_ne!(revision(&deck), old_revision);
    deck.improvements = "x".repeat(32_001);
    assert!(validate_shape(&deck, &cat).is_err());
    deck.improvements.clear();
    deck.how_to_play = "x".repeat(32_001);
    assert!(validate_shape(&deck, &cat).is_err());
}

#[test]
fn deck_prompt_has_collection_workflow_and_article_guidance() {
    use berserk_leptos::deck_prompt::*;
    let prompt = deck_build_prompt(40, "Лес, для новичка", None).unwrap();
    for expected in [
        "40",
        "Лес, для новичка",
        ARTICLE_URL,
        "10–14",
        "include_editions=true",
        "check_collection=true",
        "description",
        "how_to_play",
        "improvements",
        "[card:ID]",
        "owned_only=false",
        "save_deck",
    ] {
        assert!(prompt.contains(expected), "Missing {expected}");
    }
    assert!(deck_build_prompt(29, "", None).is_err());
    assert!(deck_build_prompt(51, "", None).is_err());
    assert!(deck_build_prompt(30, &"x".repeat(8001), None).is_err());
}

#[test]
fn local_prompt_uses_full_catalog_mcp_for_verified_improvements() {
    let cards = r#"[{"id":"owned","owned_exact_edition":3}]"#;
    let prompt = berserk_leptos::deck_prompt::local_deck_prompt(30, "", cards, None).unwrap();
    assert!(prompt.contains(cards));
    for tool in [
        "berserk_catalog",
        "catalog_info",
        "search_cards",
        "get_card",
        "next_offset",
        "owned_only=false",
    ] {
        assert!(prompt.contains(tool));
    }
    assert!(prompt.contains("НЕ разрешённый пул для cards"));
    assert!(prompt.contains("[card:ID]"));
    assert!(!prompt.contains("upgrade-catalog.json"));
}

#[test]
fn conversation_metadata_survives_backups_and_participates_in_revisions() {
    let original = draft();
    let mut deck = original.clone();
    deck.agent_session = Some(DeckAgentSession {
        id: "11111111-1111-4111-8111-111111111111".into(),
        feedback: vec!["Больше поддержки".into()],
    });
    assert_ne!(revision(&deck), revision(&original));
    let raw = serde_json::to_string(&deck).unwrap();
    assert_eq!(serde_json::from_str::<Deck>(&raw).unwrap(), deck);
    let legacy = serde_json::to_string(&original).unwrap();
    assert!(!legacy.contains("agent_session"));
    assert!(
        serde_json::from_str::<Deck>(&legacy)
            .unwrap()
            .agent_session
            .is_none()
    );
    deck.agent_session.as_mut().unwrap().feedback = vec!["x".repeat(8001)];
    assert!(validate_shape(&deck, &Catalog::load().unwrap()).is_err());
}

#[test]
fn both_prompts_require_deals_and_player_facing_text() {
    use berserk_leptos::deck_prompt::*;
    for prompt in [
        deck_build_prompt(30, "", Some(&[80])).unwrap(),
        local_deck_prompt(30, "", "[]", Some(&[80])).unwrap(),
    ] {
        assert!(prompt.contains(PLAYER_TEXT_GUIDANCE));
        assert!(prompt.contains(DEAL_GUIDANCE));
        assert!(prompt.contains("не менее пяти раз"));
        assert!(prompt.contains("squad_indices"));
    }
}

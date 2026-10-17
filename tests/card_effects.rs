use berserk_leptos::{
    card_effects::{UNIQUE_EFFECTS, unique_effect},
    model::Catalog,
};
use std::collections::BTreeSet;

#[test]
fn requested_collection_and_heart_of_swarm_have_bespoke_effects() {
    let catalog = Catalog::load().unwrap();
    // Only requested card identities are retained, never collection counts/prices.
    let targets: Vec<String> =
        serde_json::from_str(include_str!("fixtures/unique-effect-targets.json")).unwrap();
    for id in targets {
        let base = catalog.get(&id).unwrap();
        let effect = unique_effect(base)
            .unwrap_or_else(|| panic!("Missing effect for {} ({id})", base.name));
        assert_eq!(UNIQUE_EFFECTS[effect].name, base.name);
        let foil = catalog.get(&format!("{id}f")).unwrap();
        assert_eq!(
            unique_effect(foil),
            Some(effect),
            "Edition must not change the bespoke artwork program"
        );
        for variant in catalog
            .cards
            .iter()
            .filter(|c| c.set_id == base.set_id && c.number == base.number && c.uses_base_art())
        {
            assert_eq!(
                unique_effect(variant),
                Some(effect),
                "Shared-art variant {} must reuse its animation",
                variant.id
            );
        }
    }
    for card in catalog
        .cards
        .iter()
        .filter(|c| c.set_id == 80 && matches!(c.rarity, 3 | 4) && c.alt.is_empty())
    {
        assert!(
            unique_effect(card).is_some(),
            "Missing Сердце роя effect: {}",
            card.name
        );
    }
}

#[test]
fn effect_registry_has_unique_valid_identities_and_protects_alternate_art() {
    let catalog = Catalog::load().unwrap();
    let mut seen = BTreeSet::new();
    for effect in UNIQUE_EFFECTS {
        assert!(
            seen.insert((effect.set_id, effect.number)),
            "Duplicate shader identity"
        );
        let id = format!("{}{:03}", effect.set_id, effect.number);
        assert!(matches!(catalog.get(&id).unwrap().rarity, 3 | 4));
    }
    // Actual alternate illustrations need their own spatial masks.
    assert!(unique_effect(catalog.get("50090altf").unwrap()).is_none());
    // Missing scans use the original art and can safely reuse the same animation.
    assert_eq!(
        unique_effect(catalog.get("80068").unwrap()),
        unique_effect(catalog.get("80068altn").unwrap())
    );
    assert!(unique_effect(catalog.get("80002").unwrap()).is_none());
}

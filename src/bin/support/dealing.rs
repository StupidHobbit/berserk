use super::*;
use berserk_leptos::shuffle::Rng;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DealInput {
    /// Supply exactly one of deck_id (paired browser) or cards (proposed main deck).
    deck_id: Option<String>,
    cards: Option<Vec<Copies>>,
    allowed_sets: Option<Vec<u16>>,
    /// Omit for a fresh shuffle. Reuse returned seed and identical cards to inspect the same hand.
    seed: Option<u64>,
    /// Optional zero-based hand indices to recruit, without repeated indices.
    squad_indices: Option<Vec<usize>>,
}

impl Workbench {
    pub async fn deal(&self, args: DealInput) -> Result<Value, String> {
        if args.deck_id.is_some() == args.cards.is_some() {
            return Err("Supply exactly one of deck_id or cards.".into());
        }
        validate_allowed_sets(args.allowed_sets.as_deref(), &self.cat)?;
        let mut deck = if let Some(id) = args.deck_id {
            self.bridge
                .snapshot()
                .await?
                .decks
                .into_iter()
                .find(|d| d.id == id)
                .ok_or("Deck not found")?
        } else {
            let mut deck = Deck::new("sample".into(), "Sample".into());
            for c in args.cards.unwrap_or_default() {
                if c.count == 0 || deck.cards.len() + usize::from(c.count) > 50 {
                    return Err(
                        "Counts must be positive; main deck must contain 30–50 cards.".into(),
                    );
                }
                deck.cards
                    .extend(std::iter::repeat_n(c.id, usize::from(c.count)));
            }
            deck
        };
        deck.side.clear();
        deck.validate_sets(&self.cat)?;
        if let Some(sets) = args.allowed_sets {
            if sets
                .iter()
                .any(|s| !set_allowed(deck.allowed_sets.as_deref(), *s))
            {
                return Err("Cannot widen the deck's allowed sets.".into());
            }
            deck.allowed_sets = Some(sets);
        }
        deck.validate_sets(&self.cat)?;
        let report = deck_report(&deck, &self.cat, None);
        if report["basic_constructed_ok"] != true {
            return Err(format!("Fix the proposed deck before dealing: {report}"));
        }
        let seed = args
            .seed
            .unwrap_or_else(|| (Uuid::new_v4().as_u128() as u64 & ((1 << 53) - 1)).max(1));
        let mut shuffled = deck.cards.clone();
        Rng::new(seed).shuffle(&mut shuffled);
        let hand = &shuffled[..15];
        let squad = if let Some(indices) = args.squad_indices {
            let mut seen = std::collections::BTreeSet::new();
            let mut ids = vec![];
            for index in &indices {
                if *index >= hand.len() || !seen.insert(*index) {
                    return Err("squad_indices must be distinct hand indices from 0 to 14.".into());
                }
                ids.push(hand[*index].clone());
            }
            let first = squad_budget(&ids, &self.cat, false, 0);
            let second = squad_budget(&ids, &self.cat, true, 0);
            let issues = squad_issues(&ids, &self.cat);
            json!({"indices":indices,"stats":Stats::of(&ids,&self.cat),"issues":issues,
                "first":{"gold_left":first.0,"silver_left":first.1,"basic_legal":first.0>=0 && first.1>=0 && issues.is_empty()},
                "second":{"gold_left":second.0,"silver_left":second.1,"basic_legal":second.0>=0 && second.1>=0 && issues.is_empty()}})
        } else {
            Value::Null
        };
        Ok(
            json!({"seed":seed,"deck_size":deck.cards.len(),"hand_size":15,
            "hand":hand.iter().enumerate().map(|(index,id)|json!({"index":index,"card":self.card(self.cat.get(id).unwrap(),None)})).collect::<Vec<_>>(),
            "hand_stats":Stats::of(hand,&self.cat),"squad":squad,
            "notes":"15 cards drawn without replacement from the main deck; sideboard excluded. Each call without seed is a fresh shuffle. Stats describe the hand, not a recruited squad. Supply squad_indices with the same seed/cards to assess recruitment. Budget uses 24 gold/22 silver first, 25/23 second, extra-element penalties and silver paid with spare gold; no mulligan penalties or special card abilities. Review card rules. Sample hands are not played matches or proof of balance."}),
        )
    }
}

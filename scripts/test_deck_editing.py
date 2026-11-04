#!/usr/bin/env python3
"""MCP working-deck integration with an in-memory app; no real user data or model."""
from test_mcp import Client, ROOT
from test_codex import BrowserPeer


def main():
    client = Client(ROOT / 'target/debug/berserk-mcp')
    peer = None
    try:
        client.request('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'editing-test', 'version': '1'}})
        client.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        distinct = {}
        for card in client.tool('search_cards', {'set_id': 80, 'limit': 100})['cards']:
            if not card['banned']:
                distinct.setdefault(card['name'], card)
        cards = list(distinct.values())[:12]
        owned = {card['id']: 3 for card in cards[:11]}
        editions = client.tool('search_cards', {'set_id': 80, 'include_editions': True, 'limit': 100})['cards']
        alternate = next(c for c in editions if c['name'] == cards[0]['name'] and c['id'] != cards[0]['id'])
        owned[alternate['id']] = 3
        peer = BrowserPeer(client.tool('connection_info')['connect_url'], owned)
        client.tool('deal_deck', error=True)
        client.tool('get_current_deck', error=True)
        current = client.tool('begin_deck_edit', {'size': 30, 'allowed_sets': [80]})
        client.tool('begin_deck_edit', {'size': 30}, error=True)
        client.tool('validate_current_deck', error=True)
        initial = current['revision']
        changes = [{'id': card['id'], 'count': 3} for card in cards[:10]]
        current = client.tool('set_deck_card_counts', {'expected_revision': initial, 'changes': changes})
        client.tool('set_deck_notes', {'expected_revision': initial, 'name': 'Stale'}, error=True)
        assert not peer.decks, 'Edits must remain in a working copy until submit'
        for invalid in [
            [{'id': 'missing', 'count': 1}],
            [{'id': '10001', 'count': 1}],
            [{'id': cards[0]['id'], 'count': 4}],
            [{'id': cards[0]['id'], 'count': 0}, {'id': cards[0]['id'], 'count': 1}],
            [{'id': cards[0]['id'], 'count': 0}, {'id': cards[11]['id'], 'count': 3}],
            [{'id': cards[10]['id'], 'count': 3}],
            [{'id': cards[1]['id'], 'count': 0}, {'id': alternate['id'], 'count': 3}],
        ]:
            client.tool('set_deck_card_counts', {'expected_revision': current['revision'], 'changes': invalid}, error=True)
            assert client.tool('get_current_deck') == current
        current = client.tool('set_deck_notes', {'expected_revision': current['revision'], 'name': 'Гномы', 'description': 'Идея колоды', 'how_to_play': 'Защитите поддержку', 'improvements': 'Улучшения по роли'})
        first = client.tool('deal_deck')
        again = client.tool('deal_deck', {'seed': first['seed'], 'expected_revision': first['revision'], 'squad_indices': [0, 2, 4]})
        assert first['hand'] == again['hand'] and again['squad']['stats']['total'] == 3
        empty = client.tool('deal_deck', {'seed': first['seed'], 'expected_revision': first['revision'], 'squad_indices': []})['squad']
        assert empty['first']['gold_left'] == 24 and empty['first']['silver_left'] == 22
        assert empty['second']['gold_left'] == 25 and empty['second']['silver_left'] == 23
        assert len({client.tool('deal_deck')['seed'] for _ in range(5)}) == 5
        for invalid in [{'cards': changes}, {'deck_id': 'anything'}, {'allowed_sets': [10]}, {'seed': first['seed']}, {'squad_indices': [0, 0]}, {'squad_indices': [15]}, {'squad_indices': [-1]}]:
            client.tool('deal_deck', invalid, error=True)
        current = client.tool('set_deck_card_counts', {'expected_revision': current['revision'], 'changes': [{'id': cards[0]['id'], 'count': 0}, {'id': cards[10]['id'], 'count': 3}]})
        client.tool('deal_deck', {'seed': first['seed'], 'expected_revision': first['revision']}, error=True)
        hand = client.tool('deal_deck')
        assert all(c['card']['id'] != cards[0]['id'] for c in hand['hand'])
        assert all(c['card']['id'] in current['deck']['cards'] for c in hand['hand'])
        assert current['deck']['description'] == 'Идея колоды'
        assert client.tool('validate_current_deck')['revision'] == current['revision']
        saved = client.tool('save_current_deck', {'expected_revision': current['revision']})['saved']['deck']
        assert saved['cards'] == current['deck']['cards'] and len(peer.decks) == 1
        client.tool('save_current_deck', {'expected_revision': current['revision']})
        assert len(peer.decks) == 1, 'Retry must not create duplicates'
        client.tool('discard_deck_edit', {'expected_revision': current['revision']})
        source = client.tool('get_deck', {'id': saved['id']})
        current = client.tool('begin_deck_edit', {'deck_id': saved['id'], 'expected_revision': source['revision']})
        current = client.tool('set_deck_notes', {'expected_revision': current['revision'], 'description': 'Обновлённая стратегия'})
        peer.decks[0]['name'] = 'Manual concurrent edit'
        client.tool('save_current_deck', {'expected_revision': current['revision']}, error=True)
        assert peer.decks[0]['name'] == 'Manual concurrent edit'
        assert peer.decks[0]['description'] == 'Идея колоды'
        client.tool('discard_deck_edit', {'expected_revision': current['revision']})
        # A reserved exact-edition copy cannot also be added to the main deck.
        reserved = peer.decks[0]['cards'][0]
        peer.decks[0]['cards'].remove(reserved)
        peer.decks[0]['side'] = [reserved]
        source = client.tool('get_deck', {'id': saved['id']})
        current = client.tool('begin_deck_edit', {'deck_id': saved['id'], 'expected_revision': source['revision']})
        client.tool('set_deck_card_counts', {'expected_revision': current['revision'], 'changes': [{'id': reserved, 'count': 3}]}, error=True)
        assert client.tool('get_current_deck') == current
        client.tool('set_deck_card_counts', {'expected_revision': current['revision'], 'changes': [], 'side': []}, error=True)
        assert not peer.errors, peer.errors
        print('PASS: atomic edits, exact ownership/reserve, fixed scope, stale revisions, current-deck dealing, deterministic hands, safe saves and discard')
    finally:
        if peer:
            peer.close()
        client.close()


if __name__ == '__main__':
    main()

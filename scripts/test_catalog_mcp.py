#!/usr/bin/env python3
"""Read-only full catalog MCP regression; no sockets, model or browser required."""
from test_mcp import Client, ROOT


def main():
    client = Client(ROOT / 'target/debug/berserk-mcp', ['--catalog-only'])
    try:
        client.request('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'catalog-test', 'version': '1'}})
        client.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        tools = client.request('tools/list', {})['tools']
        assert {t['name'] for t in tools} == {'catalog_info', 'search_cards', 'get_card', 'deal_deck', 'get_current_deck', 'set_deck_card_counts', 'set_deck_notes', 'validate_current_deck', 'save_current_deck'} | {'search_proberserk_tournaments','get_proberserk_tournament','get_proberserk_deck','analyze_proberserk_decks','search_deck_memory','remember_deck_insight'}
        assert all(t['annotations']['readOnlyHint'] for t in tools if t['name'] not in {'set_deck_card_counts', 'set_deck_notes', 'save_current_deck', 'analyze_proberserk_decks', 'remember_deck_insight'})
        info = client.tool('catalog_info')
        ids, sets, offset = set(), set(), 0
        while True:
            page = client.tool('search_cards', {'include_editions': True, 'limit': 100, 'offset': offset})
            for card in page['cards']:
                assert card['id'] not in ids
                ids.add(card['id'])
                sets.add(card['set_id'])
            if page['next_offset'] is None:
                break
            offset = page['next_offset']
        assert len(ids) == info['card_records'] and len(sets) >= 10
        for set_id in sets:
            card = client.tool('search_cards', {'set_id': set_id, 'limit': 1})['cards'][0]
            detail = client.tool('get_card', {'id': card['id']})
            assert detail['id'] == card['id'] and detail['name'] == card['name'] and 'rules' in detail
        client.tool('get_current_deck', error=True)
        client.tool('deal_deck', error=True)
        client.tool('deal_deck', {'cards': []}, error=True)
        client.tool('search_cards', {'owned_only': True}, error=True)
        client.tool('get_card', {'id': 'missing'}, error=True)
        print(f'PASS: read-only stdio MCP exposes all {len(ids)} records across {len(sets)} sets, pagination and exact card lookup')
        scoped = Client(ROOT / 'target/debug/berserk-mcp', ['--catalog-only', '--allowed-sets', '[80]'])
        try:
            scoped.request('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'scoped-test', 'version': '1'}})
            scoped.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
            assert set(scoped.tool('catalog_info')['sets']) == {'80'}
            offset, seen = 0, set()
            while True:
                page = scoped.tool('search_cards', {'include_editions': True, 'limit': 100, 'offset': offset})
                assert all(c['set_id'] == 80 for c in page['cards'])
                seen.update(c['id'] for c in page['cards'])
                if page['next_offset'] is None: break
                offset = page['next_offset']
            assert len(seen) == scoped.tool('catalog_info')['card_records']
            assert scoped.tool('get_card', {'id': '80001f'})['set_id'] == 80
            scoped.tool('deal_deck', error=True)
            scoped.tool('get_card', {'id': '10001'}, error=True)
            scoped.tool('search_cards', {'set_id': 10}, error=True)
            scoped.tool('search_cards', {'allowed_sets': [10, 80]}, error=True)
            scoped.tool('search_cards', {'allowed_sets': []}, error=True)
            assert all(c['set_id'] == 80 for c in client.tool('search_cards', {'allowed_sets': [80]})['cards'])
            client.tool('get_card', {'id': '10001', 'allowed_sets': [80]}, error=True)
            print('PASS: scoped MCP hides disabled metadata/cards and rejects attempts to search or read disabled sets')
        finally:
            scoped.close()
    finally:
        client.close()


if __name__ == '__main__':
    main()

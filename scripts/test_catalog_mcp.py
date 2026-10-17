#!/usr/bin/env python3
"""Read-only full catalog MCP regression; no sockets, model or browser required."""
from test_mcp import Client, ROOT


def main():
    client = Client(ROOT / 'target/debug/berserk-mcp', ['--catalog-only'])
    try:
        client.request('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'catalog-test', 'version': '1'}})
        client.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        tools = client.request('tools/list', {})['tools']
        assert {t['name'] for t in tools} == {'catalog_info', 'search_cards', 'get_card', 'deal_deck'}
        assert all(t['annotations']['readOnlyHint'] for t in tools)
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
        candidates=client.tool('search_cards', {'set_id':80,'limit':100})['cards']
        distinct={}
        for c in candidates:
            if not c['banned']: distinct.setdefault(c['name'],c)
        cards=[{'id':c['id'],'count':3} for c in list(distinct.values())[:10]]
        first=client.tool('deal_deck', {'cards':cards,'allowed_sets':[80],'seed':123456})
        assert len(first['hand'])==15 and first['deck_size']==30
        hand_ids=[h['card']['id'] for h in first['hand']]
        assert all(hand_ids.count(c['id'])<=c['count'] for c in cards)
        again=client.tool('deal_deck', {'cards':cards,'allowed_sets':[80],'seed':123456,'squad_indices':[0,2,4]})
        assert again['hand']==first['hand'] and again['squad']['stats']['total']==3
        empty=client.tool('deal_deck', {'cards':cards,'seed':123456,'squad_indices':[]})['squad']
        assert empty['first']['gold_left']==24 and empty['first']['silver_left']==22
        assert empty['second']['gold_left']==25 and empty['second']['silver_left']==23
        seeds={client.tool('deal_deck', {'cards':cards})['seed'] for _ in range(5)}
        assert len(seeds)==5
        for indices in [[0,0],[15],[-1]]:
            client.tool('deal_deck', {'cards':cards,'squad_indices':indices},error=True)
        for bad in [{}, {'cards':[]}, {'cards':[{'id':'80001','count':30}]},
                    {'cards':cards,'deck_id':'missing'}, {'cards':cards,'allowed_sets':[10]},
                    {'cards':[{'id':'missing','count':3}]+cards[1:]}]:
            client.tool('deal_deck',bad,error=True)
        print('PASS: reproducible 15-card hands, copy counts, fresh shuffles, squad budgets and invalid inputs')
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
            assert len(scoped.tool('deal_deck', {'cards':cards})['hand'])==15
            scoped.tool('deal_deck', {'cards':[{'id':'10001','count':3}]+cards[1:]},error=True)
            scoped.tool('deal_deck', {'cards':cards,'allowed_sets':[10,80]},error=True)
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

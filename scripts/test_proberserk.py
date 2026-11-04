#!/usr/bin/env python3
"""Public research MCP, durable memory and catalog scoping. --live additionally checks real pages."""
import argparse
import json
from pathlib import Path
import tempfile
from test_mcp import Client, ROOT
from proberserk_fixture import TOOLS, seed_research, exercise_research


def connect(root):
    client = Client(ROOT / 'target/debug/berserk-mcp', ['--catalog-only', '--research-dir', str(root), '--allowed-sets', '[80]'])
    client.request('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'research-test', 'version': '1'}})
    client.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
    return client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='berserk-research-test-') as tmp:
        root = Path(tmp)
        if not args.live:
            seed_research(root)
        client = connect(root)
        try:
            tools = {t['name']: t for t in client.request('tools/list')['tools']}
            assert TOOLS <= tools.keys()
            assert tools['remember_deck_insight']['annotations']['readOnlyHint'] is False
            assert tools['analyze_proberserk_decks']['annotations']['readOnlyHint'] is True
            assert tools['analyze_proberserk_decks']['annotations']['openWorldHint'] is False
            for tool in ('get_proberserk_deck', 'get_proberserk_tournament'):
                client.tool(tool, {'url': 'https://example.com/private'}, error=True)
            client.tool('remember_deck_insight', {'key': 'bad', 'title': 'bad', 'lesson': 'unverified',
                'applicability': 'unknown', 'format': 'standard', 'sources': ['https://proberserk.ru/deck/0000']}, error=True)
            if args.live:
                result = client.tool('search_proberserk_tournaments')
                events = [e for e in result['data']['events'] if 'Региональный' in e['name']][:2]
                assert len(events) == 2, result
                decks, views = [], []
                for event in events:
                    view = client.tool('get_proberserk_tournament', {'url': event['url']})
                    views.append(view)
                    top = [d for d in view['data']['decks'] if d['rank'] == 1][:2]
                    for standing in top:
                        view = client.tool('get_proberserk_deck', {'url': standing['url']})
                        assert view['data']['total_cards'] >= 30
                        assert all(c['set_id'] == 80 for card in view['data']['cards'] for c in card['local_matches'])
                        views.append(view)
                        decks.append(standing['url'])
                comparison = client.tool('analyze_proberserk_decks', {'deck_urls': decks})
                assert not (root / 'memory.json').exists(), 'Comparison must not write persistent memory'
                client.tool('remember_deck_insight', {'key': 'live-sample-caution', 'title': 'Top-deck sample interpretation',
                    'lesson': 'Player placement and record may cover two registered decks. Published top lists support sample-level comparisons, not per-deck win rates.',
                    'applicability': 'Multi-deck constructed events; verify the event rules and season.', 'format': 'standard', 'sources': decks})
                if args.report:
                    args.report.write_text(json.dumps({'events': events, 'views': views, 'comparison': comparison,
                        'memory': json.loads((root / 'memory.json').read_text())}, ensure_ascii=False, indent=2))
                query = 'Top-deck sample'
            else:
                exercise_research(client.tool)
                client.tool('analyze_proberserk_decks', {'deck_urls': ['https://proberserk.ru/deck/cd1'] * 2}, error=True)
                query = 'Fixture lesson'
            first = client.tool('search_deck_memory', {'query': query})
            assert first['total_matches'] >= 1
        finally:
            client.close()
        client = connect(root)
        try:
            restored = client.tool('search_deck_memory', {'query': query})
            assert restored['insights'][0]['lesson'] == first['insights'][0]['lesson']
            assert restored['insights'][0]['sources']
        finally:
            client.close()
    print('PASS: research tools, source validation, top-deck analysis, scoped card mapping and memory across server restarts' + (' (live ProBerserk)' if args.live else ' (offline fixtures)'))


if __name__ == '__main__':
    main()

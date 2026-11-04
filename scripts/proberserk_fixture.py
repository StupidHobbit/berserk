"""Synthetic cached research for deterministic MCP/CLI tests; never uses real profiles."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from urllib.parse import urlencode

TOOLS = {'search_proberserk_tournaments', 'get_proberserk_tournament', 'get_proberserk_deck',
         'analyze_proberserk_decks', 'search_deck_memory', 'remember_deck_insight'}
ORIGIN = 'https://proberserk.ru'


def cache_key(url):
    value = 0xcbf29ce484222325
    for byte in url.encode():
        value = ((value ^ byte) * 0x100000001b3) & 0xffffffffffffffff
    return f'{value:016x}'


def seed_research(root):
    root = Path(root)
    (root / 'sources').mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    today = now.date()
    events, urls = [], []

    def save(url, data):
        (root / 'sources' / f'{cache_key(url)}.json').write_text(json.dumps(
            {'version': 1, 'url': url, 'fetched_at': int(now.timestamp()), 'data': data}))

    for i in (1, 2):
        event_url, deck_url = f'{ORIGIN}/tournament/ab{i}', f'{ORIGIN}/deck/cd{i}'
        event = {'url': event_url, 'name': f'Synthetic regional {i}', 'date': str(today - timedelta(days=i)),
                 'players': 64, 'format': 'standard', 'city': 'Test', 'club': ''}
        standing = {'url': deck_url, 'name': f'Test deck {i}', 'player': f'Test player {i}',
                    'placement': '1', 'rank': 1, 'record': '5-0', 'elements': ['Леса']}
        save(event_url, {'event': event, 'sets': 'Сердце Роя', 'description': '', 'decks': [standing]})
        save(deck_url, {'url': deck_url, 'name': standing['name'], 'player': standing['player'],
                       'tournament_url': event_url, 'event_context': 'Synthetic fixture', 'format': 'standard',
                       'sets': 'Сердце Роя', 'date': event['date'], 'description': '', 'cards': [
                           {'name': 'Тестовая поддержка', 'count': 3, 'source_url': f'{ORIGIN}/card/ef1',
                            'section': 'regular', 'cost': 3, 'elements': ['Леса'], 'edition': 'Synthetic'},
                           {'name': f'Тестовый боец {i}', 'count': 2, 'source_url': f'{ORIGIN}/card/ff{i}',
                            'section': 'elite', 'cost': 5, 'elements': ['Леса'], 'edition': 'Synthetic'}]})
        events.append(event)
        urls.append(deck_url)
    query = urlencode({'format': 'standard', 'records': '100', 'page': '1',
                       'from': str(today - timedelta(days=365)), 'to': str(today)})
    save(f'{ORIGIN}/tournament/list/all?{query}', {'events': events, 'has_next_page': False})
    return urls


def exercise_research(call):
    call('search_deck_memory', {'query': ''})
    events = call('search_proberserk_tournaments')['data']['events']
    urls = []
    for event in events[:2]:
        tournament = call('get_proberserk_tournament', {'url': event['url']})['data']
        url = tournament['decks'][0]['url']
        call('get_proberserk_deck', {'url': url})
        urls.append(url)
    analysis = call('analyze_proberserk_decks', {'deck_urls': urls})['analysis']
    assert analysis['sample_events'] == 2 and analysis['sample_decks'] == 2
    assert analysis['card_frequencies'][0]['sample_decks'] == 2
    call('remember_deck_insight', {'key': 'fixture-lesson', 'title': 'Fixture lesson',
        'lesson': 'A shared support role appears in this synthetic sample; this is not a win rate.',
        'applicability': 'Test fixtures only, no actual metagame claim.', 'format': 'standard', 'sources': urls})

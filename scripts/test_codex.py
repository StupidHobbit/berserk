#!/usr/bin/env python3
"""Integration of UI WebSocket events, local CLI, validation, cancellation and MCP status.
Uses an in-memory browser protocol peer and a fake CLI; never accesses real browser storage.
Pass --real to additionally exercise the installed/authenticated Codex CLI once.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
from pathlib import Path
import socket
import struct
import tempfile
import threading
import time
from urllib.parse import urlparse
from test_mcp import Client, ROOT

def revision(deck):
    keys=['id','name','description','how_to_play','improvements','allowed_sets','cards','side','tags']
    if deck.get('agent_session') is not None: keys.append('agent_session')
    data={k:deck[k] for k in keys}
    if data.get('agent_session'):
        session=data['agent_session']
        data['agent_session']={k:session[k] for k in ['id','feedback']}
        if session.get('chat'):
            chat=session['chat']
            data['agent_session']['chat']={'entries':[{k:e[k] for k in ['id','kind','title','text','details','status']} for e in chat['entries']], 'omitted':chat['omitted']}
            for source, entry in zip(chat['entries'], data['agent_session']['chat']['entries']):
                if source.get('sections'):
                    entry['sections'] = [{k:section[k] for k in ['title','text']} for section in source['sections']]
    value=0xcbf29ce484222325
    for byte in json.dumps(data,ensure_ascii=False,separators=(',',':')).encode():
        value=((value^byte)*0x100000001b3)&0xffffffffffffffff
    return f'{value:016x}'

class BrowserPeer:
    def __init__(self, url, collection, origin='http://localhost:8080'):
        port, token = urlparse(url).fragment.removeprefix('agent=').split(':')
        self.sock = socket.create_connection(('127.0.0.1', int(port)), timeout=20)
        self.sock.settimeout(20)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f'GET /bridge?token={token} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n\r\n').encode())
        response = b''
        while not response.endswith(b'\r\n\r\n'):
            response += self.sock.recv(1)
        assert b'101 Switching Protocols' in response, response
        accept = base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
        assert accept in response
        self.sock.settimeout(None)
        self.collection, self.decks, self.progress = collection, [], []
        self.errors, self.lock, self.closed = [], threading.Lock(), False
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
    def read(self, n):
        data = b''
        while len(data)<n:
            piece = self.sock.recv(n-len(data))
            if not piece: raise EOFError()
            data += piece
        return data
    def send(self, value):
        payload=json.dumps(value).encode(); mask=os.urandom(4)
        header=b'\x81'
        if len(payload)<126: header+=bytes([128+len(payload)])
        elif len(payload)<65536: header+=b'\xfe'+struct.pack('!H',len(payload))
        else: header+=b'\xff'+struct.pack('!Q',len(payload))
        with self.lock: self.sock.sendall(header+mask+bytes(c^mask[i%4] for i,c in enumerate(payload)))
    def run(self):
        try:
            while not self.closed:
                first,second=self.read(2); length=second&127
                if length==126: length=struct.unpack('!H',self.read(2))[0]
                if length==127: length=struct.unpack('!Q',self.read(8))[0]
                payload=self.read(length)
                if first&15==8: return
                if first&15!=1: continue
                req=json.loads(payload); cmd=req['command']; action=cmd['action']
                if action=='snapshot': result={'Ok':{'decks':self.decks,'collection':self.collection}}
                elif action=='build_progress': self.progress.append(cmd['progress']); result={'Ok':{'received':True}}
                elif action=='save_deck':
                    deck=cmd['deck']
                    counts={card:deck['cards'].count(card)+deck['side'].count(card) for card in set(deck['cards']+deck['side'])}
                    previous=next((d for d in self.decks if d['id']==deck['id']),None)
                    stale=(previous is not None and cmd.get('expected_revision')!=revision(previous)) or (previous is None and cmd.get('expected_revision') is not None)
                    if stale: result={'Err':'Deck changed'}
                    elif cmd.get('check_collection') and any(n>self.collection.get(card,0) for card,n in counts.items()): result={'Err':'Collection changed'}
                    else:
                        self.decks[:] = [d for d in self.decks if d['id'] != deck['id']] + [deck]
                        result={'Ok':{'saved':True,'deck':deck}}
                else: raise AssertionError(action)
                self.send({'id':req['id'],'result':result})
        except (OSError,EOFError) as e:
            if not self.closed: self.errors.append(str(e))
        except Exception as e: self.errors.append(str(e))
    def close(self):
        self.closed=True
        self.sock.shutdown(socket.SHUT_RDWR)
        self.sock.close()

def wait(client, phases, timeout=15):
    deadline=time.monotonic()+timeout
    last_activity=None
    while time.monotonic()<deadline:
        p=client.tool('get_deck_build_status')
        if timeout > 60:
            actions=[e for e in p.get('chat',{}).get('entries',[]) if e['kind']=='tool']
            latest=(actions[-1]['id'],actions[-1]['status']) if actions else None
            if latest and latest != last_activity:
                print('Codex:',actions[-1]['title'],actions[-1]['status'],flush=True)
                last_activity=latest
        if p['phase'] in phases: return p
        time.sleep(.1)
    raise AssertionError(p)

FAKE=r'''#!/usr/bin/env python3
import json,sys,time,os,uuid
from pathlib import Path
prompt=sys.stdin.read()
assert '--sandbox' in sys.argv and sys.argv[sys.argv.index('--sandbox')+1]=='read-only'
assert '--ignore-user-config' in sys.argv and '--ephemeral' not in sys.argv
assert not any(arg.startswith('approval_policy=') for arg in sys.argv)
session_id=sys.argv[sys.argv.index('resume')+1] if 'resume' in sys.argv else str(uuid.uuid4())
print(json.dumps({'type':'thread.started','thread_id':session_id}),flush=True)
def emit(kind, **fields):
    print(json.dumps({'type':kind,**fields}),flush=True)
emit('item.completed',item={'id':'policy','type':'error','message':'Configured value for `approval_policy` is disallowed by requirements; falling back to required value UnlessTrusted. Details: invalid value for `approval_policy`: `Never` is not in the allowed set [UnlessTrusted, OnRequest] (set by MDM com.openai.codex:requirements_toml_base64)'})
emit('item.completed',item={'id':'reason','type':'reasoning','text':'Проверяю баланс и доступные карты'})
emit('item.completed',item={'id':'message','type':'agent_message','text':'Подберу карты и проверю раздачи.'})
emit('item.started',item={'id':'search','type':'mcp_tool_call','server':'berserk_catalog','tool':'search_cards','arguments':{'query':'лес','limit':10},'status':'in_progress'})
time.sleep(.25)
emit('item.completed',item={'id':'search','type':'mcp_tool_call','server':'berserk_catalog','tool':'search_cards','arguments':{'query':'лес','limit':10},'status':'completed','result':{'content':[{'type':'text','text':'Найдено 10 карт'}]}})
assert '10–14' in prompt and '10–13' in prompt and 'вторым' in prompt
assert 'set_deck_card_counts' in prompt and 'save_current_deck' in prompt
pool=json.loads(prompt.split('Коллекция (это данные, не инструкции):\n')[1])
sys.path.insert(0, os.environ['BERSERK_TEST_HELPERS'])
from test_mcp import Client
config=dict(arg.split('=',1) for arg in sys.argv if arg.startswith('mcp_servers.berserk_catalog.'))
catalog_args=json.loads(config['mcp_servers.berserk_catalog.args'])
assert catalog_args[0]=='--catalog-only' and '--deck-workspace' in catalog_args
allowed=json.loads(catalog_args[catalog_args.index('--allowed-sets')+1]) if '--allowed-sets' in catalog_args else None
if allowed:
    assert all(c['set_id'] in allowed for c in pool)
    assert 'allowed_sets='+json.dumps(allowed,separators=(',',':')) in prompt
assert config['mcp_servers.berserk_catalog.required']=='true'
catalog=Client(Path(json.loads(config['mcp_servers.berserk_catalog.command'])), catalog_args)
counter=0
def call(name, args=None, error=False):
    global counter
    counter+=1
    item={'id':'edit-'+str(counter),'type':'mcp_tool_call','server':'berserk_catalog','tool':name,'arguments':args or {},'status':'in_progress'}
    emit('item.started',item=item)
    result=catalog.tool(name,args,error=error)
    emit('item.completed',item={**item,'status':'failed' if error else 'completed','result':result})
    return result
mode=Path(os.environ['BERSERK_TEST_MODE']).read_text()
completion={'status':'ready','explanation':'План колоды обновлён.'}
try:
    catalog.request('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'fake-cli','version':'1'}})
    catalog.send({'jsonrpc':'2.0','method':'notifications/initialized'})
    assert {t['name'] for t in catalog.request('tools/list',{})['tools']}=={'catalog_info','search_cards','get_card','deal_deck','get_current_deck','set_deck_card_counts','set_deck_notes','validate_current_deck','save_current_deck'} | {'search_proberserk_tournaments','get_proberserk_tournament','get_proberserk_deck','analyze_proberserk_decks','search_deck_memory','remember_deck_insight'}
    info=catalog.tool('catalog_info')
    if allowed:
        assert set(info['sets'])=={str(s) for s in allowed}
        catalog.tool('search_cards',{'set_id':10},error=True)
        catalog.tool('get_card',{'id':'10001'},error=True)
    candidates=catalog.tool('search_cards',{'limit':100})['cards']
    upgrade=next(c for c in candidates if c['name'] not in {p['name'] for p in pool} and c['banned'] is not True)
    assert catalog.tool('get_card',{'id':upgrade['id']})['rules']==upgrade['rules']
    current=call('get_current_deck')
    from proberserk_fixture import exercise_research
    assert 'search_proberserk_tournaments' in prompt and 'remember_deck_insight' in prompt
    if mode != 'no_research': exercise_research(call)
    counts={id:0 for id in current['deck']['cards']}
    counts.update({c['id']:min(3,c['owned_exact_edition']) for c in pool[:10]})
    if mode=='invalid': counts['missing']=3
    if mode=='disabled': counts[os.environ['BERSERK_TEST_DISABLED_ID']]=3
    changes=[{'id':id,'count':count} for id,count in counts.items()]
    if mode in ('invalid','disabled'):
        result=call('set_deck_card_counts',{'expected_revision':current['revision'],'changes':changes},error=True)
        completion={'status':'insufficient_collection','explanation':result['content'][0]['text']}
    else:
        current=call('set_deck_card_counts',{'expected_revision':current['revision'],'changes':changes})
        notes={'name':'CLI integration test','description':'Уточнённая идея по пожеланиям' if 'resume' in sys.argv else 'Идея и синергии','how_to_play':'Игра первым и вторым\nНабор отряда','improvements':'Приобрести [card:'+upgrade['id']+'] для замены поддержки'}
        if mode=='technical': notes['improvements']='Проверено через search_cards и get_card'
        current=call('set_deck_notes',{'expected_revision':current['revision'],**notes})
        for _ in range(5):
            hand=call('deal_deck')
            assert len(hand['hand'])==15
            checked=call('deal_deck',{'seed':hand['seed'],'expected_revision':hand['revision'],'squad_indices':[0,1,2]})
            assert checked['hand']==hand['hand'] and checked['squad'] is not None
        if mode in ('technical', 'no_research'):
            result=call('validate_current_deck',error=True)
            completion={'status':'insufficient_collection','explanation':result['content'][0]['text']}
        else:
            call('validate_current_deck')
            if mode=='slow':
                emit('item.started',item={'id':'slow','type':'command_execution','command':'sleep 30','status':'in_progress'})
                time.sleep(30)
            if mode=='fail': sys.exit(2)
            if mode!='unsubmitted':
                assert call('save_current_deck',{'expected_revision':current['revision']})['prepared']
            if mode=='mutate_after_submit':
                call('set_deck_notes',{'expected_revision':current['revision'],'description':'Изменения после проверки'})
            if mode=='changed': time.sleep(1)
finally: catalog.close()
assert json.loads(Path(sys.argv[sys.argv.index('--output-schema')+1]).read_text())['required']==['status','explanation']
emit('item.completed',item={'id':'answer','type':'agent_message','text':json.dumps(completion)})
Path(sys.argv[sys.argv.index('--output-last-message')+1]).write_text(json.dumps(completion))
'''


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--real',action='store_true')
    parser.add_argument('--binary',type=Path,default=ROOT/'target/debug/berserk-mcp')
    parser.add_argument('--service-arg',action='append',default=[])
    parser.add_argument('--isolate-binary',action='store_true',help='Run a copy with no companion executable beside it')
    parser.add_argument('--research-report',type=Path,help='Preserve the isolated real-run research memory for inspection')
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='berserk-cli-test-') as tmp:
        fake=Path(tmp)/'codex';fake.write_text(FAKE);fake.chmod(0o700)
        mode=Path(tmp)/'mode';mode.write_text('valid')
        os.environ['BERSERK_TEST_MODE']=str(mode)
        os.environ['BERSERK_TEST_HELPERS']=str(ROOT/'scripts')
        if not args.real: os.environ['BERSERK_CODEX_BIN']=str(fake)
        os.environ['BERSERK_TEST_DISABLED_ID']='10001'
        os.environ['BERSERK_DATA_DIR']=str(Path(tmp)/'profile')
        if not args.real:
            from proberserk_fixture import seed_research
            seed_research(Path(tmp)/'profile'/'research')
        binary=args.binary.resolve()
        if args.isolate_binary:
            isolated=Path(tmp)/binary.name
            shutil.copy2(binary, isolated)
            binary=isolated
        client=Client(binary, args.service_arg);peer=None
        try:
            client.request('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'codex-test','version':'1'}})
            client.send({'jsonrpc':'2.0','method':'notifications/initialized'})
            cards=client.tool('search_cards',{'limit':100,'set_id':80})['cards']
            picks={};names=set()
            for c in cards:
                if c['name'] not in names and not c['banned']:
                    picks[c['id']]=3;names.add(c['name'])
                if len(picks)==(50 if args.real else 10):break
            picks['10001']=3
            peer=BrowserPeer(client.tool('connection_info')['connect_url'],picks)
            # The actual UI sends this event, without a tool invocation.
            peer.send({'event':'build_deck','request_id':'ui-test','size':30,'preferences':'Сбалансированная колода для новичка','allowed_sets':[80]})
            p=wait(client,{'succeeded','failed'},timeout=630 if args.real else 15)
            if p['phase'] != 'succeeded' and args.research_report:
                args.research_report.write_text(json.dumps(p,ensure_ascii=False,indent=2))
            assert p['phase']=='succeeded', {'message':p['message'],'failed_tools':[{'title':e['title'],'result':e.get('sections',[])} for e in p['chat']['entries'] if e['kind']=='tool' and e['status']=='failed'][-3:]}
            assert len(peer.decks)==1 and len(peer.decks[0]['cards'])==30
            assert peer.decks[0]['description'] and peer.decks[0]['how_to_play'] and peer.decks[0]['improvements']
            assert all(card in picks for card in peer.decks[0]['cards'])
            assert peer.decks[0]['allowed_sets']==[80]
            assert '10001' not in peer.decks[0]['cards']
            assert p['deck_id']==peer.decks[0]['id'] and peer.collection==picks
            if not args.real:
                entries=p['chat']['entries']
                assert entries[0]['kind']=='user' and 'Сбалансированная' in entries[0]['text']
                policy=next(e for e in entries if e['id']=='ui-test:policy')
                assert policy['kind']=='notice' and policy['status']=='notice'
                assert 'approval_policy' in policy['details']
                search=[e for e in entries if e['id']=='ui-test:search']
                assert len(search)==1 and search[0]['status']=='completed'
                assert search[0]['title']=='Ищет карты' and 'Найдено 10 карт' in search[0]['details']
                assert any(e['kind']=='reasoning' for e in entries)
                assert any(e['kind']=='assistant' for e in entries)
                assert any(any(e['id']=='ui-test:search' and e['status']=='in_progress' for e in update['chat']['entries']) for update in peer.progress)
                print('PASS: live reasoning, messages and tool start/completion stream before CLI exit')
            original_id=p['deck_id']
            session=peer.decks[0]['agent_session']['id']
            saved=client.tool('get_deck',{'id':original_id})
            assert saved['revision']==revision(saved['deck'])
            if not args.real:
                stored=saved['deck']['agent_session']['chat']['entries']
                assert any(e['id']=='ui-test:search' and e['status']=='completed' for e in stored)
                assert any(e['kind']=='assistant' for e in stored)
                # Replace the service's latest progress with an unrelated failed run.
                # Only the saved deck can supply the original transcript afterwards.
                client.tool('create_deck_with_codex',{'size':50,'preferences':'Другая колода','allowed_sets':[80]})
                unrelated=wait(client,{'failed'})
                assert not any(e['id']=='ui-test:search' for e in unrelated['chat']['entries'])
            feedback='Сделай план игры вторым подробнее; сохрани состав колоды.'
            peer.send({'event':'refine_deck','request_id':'feedback-test','deck_id':original_id,'expected_revision':saved['revision'],'feedback':feedback})
            # Wait for this request, not the previous completed job.
            deadline=time.monotonic()+5
            while client.tool('get_deck_build_status')['request_id']!='feedback-test':
                assert time.monotonic()<deadline
                time.sleep(.05)
            p=wait(client,{'succeeded','failed'},timeout=630 if args.real else 15)
            assert p['phase']=='succeeded',p
            assert len(peer.decks)==1 and peer.decks[0]['id']==original_id
            assert peer.decks[0]['agent_session']['id']==session
            assert peer.decks[0]['agent_session']['feedback'][-1]==feedback
            assert peer.decks[0]['allowed_sets']==[80]
            assert len([e for e in p['chat']['entries'] if e['kind']=='user'])==2
            if not args.real:
                assert any(e['id']=='ui-test:search' for e in p['chat']['entries'])
                assert any(e['id']=='feedback-test:search' for e in p['chat']['entries'])
                stored=peer.decks[0]['agent_session']['chat']['entries']
                assert any(e['id']=='ui-test:search' for e in stored)
                assert any(e['id']=='feedback-test:search' for e in stored)
            print('PASS: feedback resumes exact session and updates same deck with persisted history')
            if args.real:
                titles={e['title'] for e in p['chat']['entries'] if e['kind']=='tool' and e['status']=='completed'}
                assert {'Ищет крупные турниры','Сравнивает колоды победителей','Вспоминает опыт прошлых колод','Сохраняет полезный опыт'} <= titles, titles
                memory=json.loads((Path(tmp)/'profile'/'research'/'memory.json').read_text())
                assert any(i['kind']=='agent_inference' for i in memory['insights'].values())
                if args.research_report:
                    args.research_report.write_text(json.dumps({'memory':memory,'deck':peer.decks[0]},ensure_ascii=False,indent=2))
                improvements=peer.decks[0]['improvements']
                catalog=json.loads((ROOT/'data/cards.json').read_text())
                eligible=[c for c in catalog if c['name'] not in names and c.get('ban',{}).get('',False) is not True]
                assert any(re.search(r'(?<![0-9])'+re.escape(str(c['id']))+r'(?![0-9])', improvements) for c in eligible), improvements
                assert 'upgrade-catalog.json' not in improvements, improvements
                print('PASS: real Codex CLI generated an owned-only deck and upgrade suggestions referencing catalog IDs through MCP, with no catalog file')
                return
            saved=client.tool('get_deck',{'id':p['deck_id']})
            assert all(c['set_id']==80 for c in client.tool('search_cards',{'deck_id':p['deck_id'],'include_editions':True})['cards'])
            client.tool('search_cards',{'deck_id':p['deck_id'],'allowed_sets':[10,80]},error=True)
            client.tool('search_cards',{'deck_id':p['deck_id'],'set_id':10},error=True)
            client.tool('get_card',{'id':'10001','deck_id':p['deck_id']},error=True)
            update={'deck_id':p['deck_id'],'expected_revision':saved['revision'],'name':'Updated','cards':[{'id':'10001','count':1}]}
            client.tool('validate_deck',update,error=True)
            client.tool('save_deck',update,error=True)
            assert len(peer.decks)==1 and peer.decks[0]['name']!='Updated'
            update['cards']=[{'id':c,'count':saved['deck']['cards'].count(c)} for c in set(saved['deck']['cards'])]
            result=client.tool('save_deck',update)['saved']['deck']
            assert result['allowed_sets']==[80] and result['description']==saved['deck']['description']
            assert len(peer.decks)==1
            assert result['agent_session']['id']==session
            current=client.tool('get_deck',{'id':original_id})
            refine={'deck_id':original_id,'expected_revision':current['revision'],'feedback':'Уточни описание'}
            # Reject outdated request before invoking the model.
            client.tool('refine_deck_with_codex',{**refine,'expected_revision':'0'*16})
            assert 'изменилась' in wait(client,{'failed'})['message']
            mode.write_text('changed')
            client.tool('refine_deck_with_codex',refine)
            deadline=time.monotonic()+5
            while 'подбирает' not in client.tool('get_deck_build_status')['message']:
                assert time.monotonic()<deadline
                time.sleep(.05)
            peer.decks[0]['name']='Manual edit while running'
            assert wait(client,{'failed'})['phase']=='failed'
            assert peer.decks[0]['name']=='Manual edit while running' and peer.decks[0]['agent_session']['id']==session
            current=client.tool('get_deck',{'id':original_id})
            refine['expected_revision']=current['revision']
            mode.write_text('slow')
            job=client.tool('refine_deck_with_codex',refine)
            deadline=time.monotonic()+5
            while not any(e['id'].endswith(':slow') for e in client.tool('get_deck_build_status')['chat']['entries']):
                assert time.monotonic()<deadline
                time.sleep(.05)
            client.tool('cancel_deck_build',{'id':job['request_id']})
            assert wait(client,{'cancelled'})['phase']=='cancelled'
            cancelled=client.tool('get_deck_build_status')['chat']['entries']
            assert cancelled and all(e['status']!='in_progress' for e in cancelled)
            assert peer.decks[0]==current['deck']
            mode.write_text('technical')
            client.tool('refine_deck_with_codex',refine)
            assert 'служебные подробности' in wait(client,{'failed'})['message']
            assert peer.decks[0]==current['deck']
            # Reserve an owned copy already present in the main deck for the sideboard.
            side_id=peer.decks[0]['cards'][0]
            peer.decks[0]['side']=[side_id]
            peer.decks[0]['tags']=['Keep this tag']
            peer.collection[side_id]+=1
            refine['expected_revision']=client.tool('get_deck',{'id':original_id})['revision']
            mode.write_text('valid')
            client.tool('refine_deck_with_codex',{**refine,'restart_session':True})
            assert wait(client,{'succeeded'})['phase']=='succeeded'
            assert peer.decks[0]['agent_session']['id']!=session
            assert peer.decks[0]['agent_session']['feedback']==[refine['feedback']]
            assert peer.decks[0]['side']==[side_id] and peer.decks[0]['tags']==['Keep this tag']
            latest=client.tool('get_deck',{'id':original_id})
            working=client.tool('begin_deck_edit',{'deck_id':original_id,'expected_revision':latest['revision']})
            deal=client.tool('deal_deck',{'seed':42,'expected_revision':working['revision']})
            assert deal['deck_size']==30 and len(deal['hand'])==15
            client.tool('deal_deck',{'cards':[{'id':'10001','count':30}]},error=True)
            print('PASS: MCP feedback, stale revisions, concurrent edits, cancellation, technical-text rejection and new conversation')
            for failure in ['unsubmitted','mutate_after_submit']:
                mode.write_text(failure)
                client.tool('create_deck_with_codex',{'size':30,'allowed_sets':[80]})
                assert 'save_current_deck' in wait(client,{'failed'})['message']
                assert len(peer.decks)==1
            mode.write_text('no_research')
            client.tool('create_deck_with_codex',{'size':30,'allowed_sets':[80]})
            assert 'search_deck_memory' in wait(client,{'failed'})['message']
            assert len(peer.decks)==1
            print('PASS: automatic deck submission rejects skipped tournament research/memory')
            mode.write_text('disabled')
            client.tool('create_deck_with_codex',{'size':30,'allowed_sets':[80]})
            assert wait(client,{'failed'})['phase']=='failed' and len(peer.decks)==1
            client.tool('create_deck_with_codex',{'size':30,'allowed_sets':[]},error=True)
            client.tool('create_deck_with_codex',{'size':30,'allowed_sets':[9999]},error=True)
            mode.write_text('invalid')
            client.tool('create_deck_with_codex',{'size':30})
            assert wait(client,{'failed'})['phase']=='failed' and len(peer.decks)==1
            mode.write_text('slow')
            job=client.tool('create_deck_with_codex',{'size':30})
            client.tool('create_deck_with_codex',{'size':30},error=True)
            deadline=time.monotonic()+5
            while not any(e['id'].endswith(':slow') for e in client.tool('get_deck_build_status')['chat']['entries']):
                assert time.monotonic()<deadline
                time.sleep(.05)
            client.tool('cancel_deck_build',{'id':job['request_id']})
            assert wait(client,{'cancelled'})['phase']=='cancelled'
            cancelled=client.tool('get_deck_build_status')['chat']['entries']
            assert cancelled and all(e['status']!='in_progress' for e in cancelled) and len(peer.decks)==1
            # Restart after cancellation, and ensure process failures are surfaced.
            mode.write_text('changed')
            client.tool('create_deck_with_codex',{'size':30})
            wait(client,{'running'})
            # Wait for the CLI stage, after its collection snapshot was taken.
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                if 'подбирает' in client.tool('get_deck_build_status')['message']: break
                time.sleep(.05)
            peer.collection={}
            assert wait(client,{'failed'})['phase']=='failed' and len(peer.decks)==1
            peer.collection=picks.copy()
            mode.write_text('fail')
            client.tool('create_deck_with_codex',{'size':30})
            assert wait(client,{'failed'})['phase']=='failed'
            peer.collection.clear()
            client.tool('create_deck_with_codex',{'size':30})
            assert 'Недостаточно карт' in wait(client,{'failed'})['message']
            assert len(peer.decks)==1 and not peer.errors,peer.errors
            print('PASS: scoped UI/CLI/MCP generation and saved-deck searches/updates; disabled cards rejected, invalid output, concurrency, cancel, changed collection, CLI failure, insufficient collection')
        finally:
            if peer: peer.close()
            client.close()

if __name__=='__main__':main()

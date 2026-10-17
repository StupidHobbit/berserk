"""Compile and compare each unique GLSL shader in an isolated Firefox profile.
Read-only with respect to collection/deck data. Requires explicit browser-test authorization.
"""
import base64, json, socket, subprocess, tempfile, time, sys
from pathlib import Path

class Marionette:
    def __init__(self, port):
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=30)
        self.seq = 0
        self.iframe = False
        print('handshake', self.read(), flush=True)
    def read(self):
        size = b''
        while True:
            char = self.sock.recv(1)
            if not char: raise EOFError('Firefox closed the connection')
            if char == b':': break
            size += char
        body = bytearray()
        while len(body) < int(size):
            chunk = self.sock.recv(int(size) - len(body))
            if not chunk: raise EOFError('Incomplete response')
            body.extend(chunk)
        return json.loads(body)
    def command(self, name, **params):
        self.seq += 1
        data = json.dumps([0, self.seq, name, params], ensure_ascii=False).encode()
        self.sock.sendall(str(len(data)).encode() + b':' + data)
        response = self.read()
        assert response[1] == self.seq, response
        if response[2]: raise RuntimeError(response[2])
        result = response[3]
        return result.get('value', result) if isinstance(result, dict) else result
    def js(self, code):
        if self.iframe: code = 'const document = window.document.querySelector("iframe").contentDocument;' + code
        return self.command('WebDriver:ExecuteScript', script=code, args=[], newSandbox=True, sandbox='default', line=1, filename='foil_probe')


ROOT = Path(__file__).resolve().parents[1]
all_cards=json.loads((ROOT/'data/cards.json').read_text())
selected=[]
filters=set(sys.argv[1:]) - {'headed'}
for card in all_cards:
    path=ROOT/'src/shaders/unique'/f"card_{card['id']}.frag"
    if card['id']=='60218':path=ROOT/'src/shaders/higart.frag'
    if not path.exists() or (filters and card['id'] not in filters):continue
    art=ROOT/'public/cards'/str(card['set_id'])/f"{card['number']}.{card['fmt']}"
    mime={'jpg':'image/jpeg','webp':'image/webp','png':'image/png'}[card['fmt']]
    selected.append(dict(id=card['id'],name=card['name'],requireVisibleMotion=card['set_id']==80 and card['rarity']==3,fragment=path.read_text(),image='data:'+mime+';base64,'+base64.b64encode(art.read_bytes()).decode()))
assert selected,'No shaders selected'
html=(ROOT/'tests/unique-shaders.html').read_text().replace('/* TEST_DATA */','const vertex='+json.dumps((ROOT/'src/shaders/foil.vert').read_text())+';const cards='+json.dumps(selected,ensure_ascii=False)+';')
probe=Path('/tmp/ultra-shaders-test.html');probe.write_text(html)
outputs=Path('/tmp/ultra-shader-captures');outputs.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='unique-firefox-') as profile:
    port=38281
    Path(profile,'user.js').write_text(f'user_pref("marionette.port", {port});\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("layout.css.devPixelsPerPx", "1.0");\n')
    with open('/tmp/unique-firefox.log','w') as log:
        process=subprocess.Popen(['/Applications/Firefox.app/Contents/MacOS/firefox']+([] if 'headed' in sys.argv else ['--headless'])+['--no-remote','--marionette','--profile',profile,'about:blank'],stdout=log,stderr=subprocess.STDOUT)
        client=None
        try:
            for attempt in range(100):
                try: client=Marionette(port);break
                except ConnectionRefusedError:time.sleep(.2)
            if not client:raise RuntimeError('Firefox did not start')
            client.command('WebDriver:NewSession',capabilities={})
            client.command('WebDriver:SetWindowRect',width=1600,height=1200)
            client.command('WebDriver:Navigate',url=probe.as_uri())
            for attempt in range(240):
                if client.js('return window.wrappedJSObject.shaderDone===true;'):break
                time.sleep(.25)
            results=client.js('return window.wrappedJSObject.shaderResults;')
            captures=client.js('return window.wrappedJSObject.shaderCaptures;')
            for capture in captures:
                for edition in ['base','foil']:(outputs/f"{capture['id']}-{edition}.png").write_bytes(base64.b64decode(capture[edition].split(',',1)[1]))
            data=client.command('WebDriver:TakeScreenshot',id=None,highlights=[],full=False)
            (outputs/'proof-sheet.png').write_bytes(base64.b64decode(data))
            # Keep readable proof pages when validating the full card scope.
            for page in range((len(selected)+7)//8):
                client.js('document.querySelectorAll("article").forEach((e,i)=>e.hidden=!(i>='+str(page*8)+'&&i<'+str((page+1)*8)+'));window.scrollTo(0,0);')
                data=client.command('WebDriver:TakeScreenshot',id=None,highlights=[],full=False)
                (outputs/f'proof-page-{page+1}.png').write_bytes(base64.b64decode(data))
            (outputs/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
            print(json.dumps(results,ensure_ascii=False),flush=True)
            assert len(results)==len(selected) and all(r.get('pass') for r in results),'Shader validation failed'
        finally:
            if client:
                try:client.command('Marionette:Quit',flags=['eForceQuit'])
                except Exception:pass
                client.sock.close()
            if process.poll() is None:
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait()

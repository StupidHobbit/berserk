"""Capture foil rendering in an isolated Firefox profile (macOS).

Requires the local app on port 8080 and /Applications/Firefox.app. Uses Mozilla's
Marionette wire protocol; no driver download or Python packages are required.
Does not connect to an existing Firefox session. Screenshots are saved in /tmp.

Examples:
    python3 scripts/test_foil_firefox.py 2300 headed
    python3 scripts/test_foil_firefox.py 1280 diagnostic
    python3 scripts/test_foil_firefox.py 1905 headed regression
    python3 scripts/test_foil_firefox.py 1905 regression reduced
    python3 scripts/test_foil_firefox.py 1600 headed higart
    python3 scripts/test_foil_firefox.py 1600 unique

The first argument is window width. Optional `headed` uses a normal window;
`diagnostic` checks the diagnostic page instead of the main listing.
Run only with explicit user authorization when browser tooling requires it.
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

with tempfile.TemporaryDirectory(prefix='foil-firefox-') as profile:
    port = 38281
    Path(profile, 'user.js').write_text(f'user_pref("marionette.port", {port});\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("layout.css.devPixelsPerPx", "2.0");\n' + ('user_pref("ui.prefersReducedMotion", 1);\n' if 'reduced' in sys.argv else ''))
    with open('/tmp/foil-firefox.log', 'w') as log:
        process = subprocess.Popen(['/Applications/Firefox.app/Contents/MacOS/firefox'] + ([] if 'headed' in sys.argv else ['--headless']) + ['--no-remote', '--marionette', '--profile', profile, 'about:blank'], stdout=log, stderr=subprocess.STDOUT)
        client = None
        try:
            for attempt in range(100):
                try:
                    client = Marionette(port)
                    break
                except ConnectionRefusedError: time.sleep(.2)
            if not client: raise RuntimeError('Firefox did not start: '+Path('/tmp/foil-firefox.log').read_text())
            print('session', client.command('WebDriver:NewSession', capabilities={}), flush=True)
            client.command('WebDriver:SetWindowRect', width=int(sys.argv[1]) if len(sys.argv)>1 else 1280, height=1100)
            client.command('WebDriver:Navigate', url='http://127.0.0.1:8080/public/foil-diagnostics.html' if 'diagnostic' in sys.argv else 'http://127.0.0.1:8080/#catalog')
            if 'diagnostic' in sys.argv:
                client.iframe = True
            catalog_ready = False
            for attempt in range(300):
                if client.js('return !!document.querySelector(".card-open.foil");'):
                    catalog_ready = True
                    break
                time.sleep(.1)
            assert catalog_ready, 'Catalog did not load: '+str(client.js('return document.body.innerText.slice(0,2000);'))
            client.js('document.querySelector(".card-open.foil").scrollIntoView({block:"center"});')
            for attempt in range(100):
                if client.js('return document.querySelector(".card-open.foil").getAttribute("data-foil-renderer")==="webgl";'): break
                time.sleep(.1)
            print('geometry', json.dumps(client.js('return Array.from(document.querySelectorAll(".card-open.foil")).slice(0,3).map(e=>({tag:e.tagName,renderer:e.dataset.foilRenderer,children:Array.from(e.children).map(c=>({tag:c.tagName,width:getComputedStyle(c).width,height:getComputedStyle(c).height,x:c.getBoundingClientRect().x,bufferWidth:c.width,bufferHeight:c.height}))}));'), ensure_ascii=False), flush=True)
            if 'unique' in sys.argv:
                root = Path(__file__).resolve().parents[1]
                ids = json.loads((root/'tests/fixtures/unique-effect-targets.json').read_text())
                catalog = {c['id']: c for c in json.loads((root/'data/cards.json').read_text())}
                client.js('const s=document.querySelector(".filter-panel select");s.value="";s.dispatchEvent(new Event("change",{bubbles:true}));')
                for id in ids:
                    name = catalog[id]['name']
                    client.js('const q=document.querySelector("input[type=search]");q.value='+json.dumps(name)+';q.dispatchEvent(new Event("input",{bubbles:true}));window.scrollTo(0,0);')
                    expected = 'higart' if id == '60218' else 'card_'+id
                    check = 'return '+json.dumps([id,id+'f'])+'.every((id,i)=>{const c=document.querySelector(`[data-card-id="${id}"] canvas`);return c&&c.dataset.cardEffect==='+json.dumps(expected)+'&&c.dataset.isFoil===String(i===1)&&c.parentElement.dataset.foilRenderer==="webgl"&&getComputedStyle(c).opacity==="1";});'
                    # Search also matches rules and substrings (Имаго matches
                    # Архимаг). Visit each edition: offscreen cards intentionally
                    # defer rendering, and base/foil can land on different rows.
                    for edition_id, foil in [(id, False), (id+'f', True)]:
                        edition_check = 'const c=document.querySelector('+json.dumps('[data-card-id="'+edition_id+'"] canvas')+');if(!c)return false;c.scrollIntoView({block:"center"});return c.dataset.cardEffect==='+json.dumps(expected)+'&&c.dataset.isFoil==='+json.dumps(str(foil).lower())+'&&c.parentElement.dataset.foilRenderer==="webgl"&&getComputedStyle(c).opacity==="1";'
                        for attempt in range(100):
                            if client.js(edition_check):break
                            time.sleep(.1)
                    ready = client.js(check)
                    if not ready:
                        print('FAILED SURFACES', client.js('return Array.from(document.querySelectorAll(".card-tile")).map(e=>({id:e.dataset.cardId,y:e.getBoundingClientRect().y,canvases:Array.from(e.querySelectorAll("canvas")).map(c=>({effect:c.dataset.cardEffect,foil:c.dataset.isFoil,renderer:c.parentElement.dataset.foilRenderer,width:c.width,height:c.height}))}));'), flush=True)
                    assert ready, 'Unique shader not rendered: '+id+' '+name
                    print('PASS application editions: '+id+' '+name,flush=True)
                # Every program has now been visited. Verify restoration rebuilds a
                # visible unique program lazily, not just the generic foil program.
                client.js('const g=document.querySelector("[data-foil-engine]").getContext("webgl");window.wrappedJSObject.testLoss=g.getExtension("WEBGL_lose_context");window.wrappedJSObject.testLoss.loseContext();')
                lost=False
                for attempt in range(100):
                    if client.js('return document.querySelector("[data-foil-engine]").dataset.contextState==="lost";'):lost=True;break
                    time.sleep(.1)
                assert lost, 'WebGL context-loss handler did not run'
                client.js('window.wrappedJSObject.testLoss.restoreContext();')
                ready=False
                for attempt in range(100):
                    if client.js(check):ready=True;break
                    time.sleep(.1)
                assert ready, 'Visible unique shaders did not recover after context loss'
                print('PASS lazy shader context restoration',flush=True)
            if 'higart' in sys.argv:
                client.js('const set=document.querySelector(".filter-panel select");set.value="";set.dispatchEvent(new Event("change",{bubbles:true}));const q=document.querySelector("input[type=search]");q.value="Хигарт Несокрушимый";q.dispatchEvent(new Event("input",{bubbles:true}));')
                for attempt in range(100):
                    ready = client.js('return Array.from(document.querySelectorAll(".unique-finish")).filter(e=>e.dataset.foilRenderer==="webgl").length===2;')
                    if ready: break
                    time.sleep(.1)
                assert ready, 'Both Higart editions must render with WebGL'
                assert client.js('return Array.from(document.querySelectorAll(".card-grid canvas")).every(c=>c.dataset.cardEffect==="higart"&&getComputedStyle(c).opacity==="1");')
                print('PASS Higart: base and foil use the bespoke shader', flush=True)
                assert client.js("""return document.querySelector('[data-card-id="60218"] canvas').dataset.isFoil==="false"&&document.querySelector('[data-card-id="60218f"] canvas').dataset.isFoil==="true";""")
                edition_diff = client.js("""
                    const c=document.querySelector('[data-foil-engine]'),g=c.getContext('webgl'),p=g.getParameter(g.CURRENT_PROGRAM);
                    const f=g.getUniformLocation(p,'u_is_foil'),t=g.getUniformLocation(p,'u_time'),s=g.getUniformLocation(p,'u_seed');
                    if(!f)throw Error('Missing unique-shader foil parameter');
                    const original=[g.getUniform(p,f),g.getUniform(p,t),g.getUniform(p,s)],frames=[];
                    try {
                        g.uniform1f(t,5);g.uniform1f(s,.137);
                        for(const foil of [0,1,0]){g.uniform1i(f,foil);g.drawArrays(g.TRIANGLES,0,6);const data=new Uint8Array(c.width*c.height*4);g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,data);frames.push(data);}
                        let art=0,print=0,reset=0;
                        for(let i=0;i<frames[0].length;i++){
                            if(frames[0][i]!==frames[2][i])reset++;
                            if(frames[0][i]!==frames[1][i]){const y=1-(Math.floor(i/4/c.width)+.5)/c.height;if(y<.14||y>.57)print++;else art++;}
                        }
                        return {art,print,reset,error:g.getError()};
                    } finally {g.uniform1i(f,original[0]?1:0);g.uniform1f(t,original[1]);g.uniform1f(s,original[2]);g.drawArrays(g.TRIANGLES,0,6);}
                """)
                assert edition_diff['art']>1000 and edition_diff['print']==0 and edition_diff['reset']==0 and edition_diff['error']==0, edition_diff
                print('PASS is_foil changes only artwork at identical time/seed, resets cleanly', edition_diff, flush=True)

                pixels = 'const c=document.querySelector(".unique-finish canvas");return {w:c.width,h:c.height,data:Array.from(c.getContext("2d").getImageData(0,0,c.width,c.height).data)};'
                # Search removes many cards while fonts/layout settle. Compare
                # animation frames only after the canvas and image size stabilize.
                previous_geometry=None
                stable=0
                for attempt in range(100):
                    geometry=client.js('const c=document.querySelector(".unique-finish canvas"),i=c.parentElement.querySelector("img");return {w:c.width,h:c.height,iw:i.clientWidth,ih:i.clientHeight,fonts:document.fonts.status};')
                    stable=stable+1 if geometry==previous_geometry and geometry['fonts']=='loaded' else 0
                    if stable>=3:break
                    previous_geometry=geometry
                    time.sleep(.15)
                assert stable>=3, 'Card layout did not settle: '+str(geometry)
                before = client.js(pixels)
                time.sleep(.7)
                after = client.js(pixels)
                assert (before['w'],before['h']) == (after['w'],after['h']), (before['w'],before['h'],after['w'],after['h'])
                changes = {'art':0,'print':0}
                for i,(a,b) in enumerate(zip(before['data'],after['data'])):
                    if a != b:
                        y=(i//4//before['w'])/before['h']
                        changes['print' if y<.14 or y>.57 else 'art'] += 1
                assert changes['print']==0, changes
                assert (changes['art']==0)==('reduced' in sys.argv), changes
                print('PASS Higart animation / unchanged printed text', changes, flush=True)
                for layout in ['Список', 'Сетка']:
                    client.js("document.querySelector(" + json.dumps(f'button[aria-label="{layout}"]') + ").click();")
                    time.sleep(.4)
                    assert client.js('return Array.from(document.querySelectorAll(".unique-finish")).every(e=>e.dataset.foilRenderer==="webgl");')
                client.js('document.querySelector(".unique-finish .card-hit-area").click();')
                time.sleep(.5)
                assert client.js('return document.querySelector(".detail-image canvas").dataset.cardEffect==="higart"&&document.querySelector(".detail-image").dataset.foilRenderer==="webgl";')
                for index in range(4):
                    time.sleep(.35)
                    raw=client.js('return document.querySelector(".detail-image canvas").toDataURL();')
                    Path(f'/tmp/higart-frame-{index}.png').write_bytes(base64.b64decode(raw.split(',',1)[1]))
                data=client.command('WebDriver:TakeScreenshot', id=None, highlights=[], full=False)
                Path('/tmp/higart-detail.png').write_bytes(base64.b64decode(data))
                client.js('document.querySelector(".modal-close").click();')
                time.sleep(.3)
                client.js("""document.querySelector('[data-card-id="60218f"] .card-hit-area').click();""")
                time.sleep(.5)
                assert client.js('return document.querySelector(".detail-image canvas").dataset.isFoil==="true"&&document.querySelector(".detail-image").dataset.foilRenderer==="webgl";')
                raw=client.js('return document.querySelector(".detail-image canvas").toDataURL();')
                Path('/tmp/higart-foil.png').write_bytes(base64.b64decode(raw.split(',',1)[1]))
                client.js('document.querySelector(".modal-close").click();')
                time.sleep(.3)
                print('PASS Higart grid, compact and detail', flush=True)
            if 'regression' in sys.argv:
                assert not client.iframe, 'Run regression against the app directly'
                reduced = 'reduced' in sys.argv
                assert client.js('return matchMedia("(prefers-reduced-motion: reduce)").matches;') == reduced
                for layout in ['Сетка', 'Список']:
                    client.js("document.querySelector(" + json.dumps(f'button[aria-label="{layout}"]') + ").click();")
                    time.sleep(.3)
                    client.js('document.querySelector(".card-open.foil").scrollIntoView({block:"center"});')
                    for moved in [False, True]:
                        if moved:
                            client.js('const e=document.querySelector(".card-open.foil"),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerType:"mouse",clientX:r.x+r.width*.85,clientY:r.y+r.height*.25}));')
                        else:
                            client.js('document.querySelector(".card-open.foil").dispatchEvent(new PointerEvent("pointerleave"));')
                        time.sleep(.4)
                        state = client.js('const e=document.querySelector(".card-open.foil"),s=getComputedStyle(e);return {transform:s.transform,angle:s.getPropertyValue("--card-ry"),renderer:e.dataset.foilRenderer,regular:getComputedStyle(document.querySelector(".card-open:not(.foil)")).transform};')
                        assert state['renderer'] == 'webgl', state
                        if reduced:
                            assert state['transform'] == 'none', state
                        else:
                            assert state['transform'].startswith('matrix3d'), state
                            assert state['regular'].startswith('matrix3d'), state
                            if moved: assert abs(float(state['angle'].removesuffix('deg'))) > 1, state
                        print('PASS', layout, 'pointer' if moved else 'rest', state, flush=True)
                client.js('document.querySelector("button[aria-label=\\"Сетка\\"]").click();document.querySelector(".card-open.foil").dispatchEvent(new PointerEvent("pointerleave"));')
                time.sleep(.4)
                first = client.js('return document.querySelector(".card-open.foil canvas").toDataURL();')
                time.sleep(.5)
                second = client.js('return document.querySelector(".card-open.foil canvas").toDataURL();')
                assert (first == second) == reduced, 'Unexpected animation state'
                print('PASS shader motion', 'static' if reduced else 'animated', flush=True)
            time.sleep(2)
            client.js('window.requestAnimationFrame = () => 0;')
            time.sleep(.1)
            raw = client.js('return document.querySelector(".card-open.foil canvas").toDataURL();')
            Path('/tmp/foil-firefox-canvas.png').write_bytes(base64.b64decode(raw.split(',',1)[1]))
            data = client.command('WebDriver:TakeScreenshot', id=None, highlights=[], full=False)
            Path('/tmp/foil-firefox-listing.png').write_bytes(base64.b64decode(data))
            if 'diagnostic' in sys.argv:
                client.iframe = False
                client.js('document.querySelector("#capture").click();')
                time.sleep(.3)
                print('diagnostic', client.js('return document.querySelector("#report").value;'), flush=True)
                data = client.command('WebDriver:TakeScreenshot', id=None, highlights=[], full=False)
                Path('/tmp/foil-firefox-diagnostic.png').write_bytes(base64.b64decode(data))
                raise SystemExit(0)
            element = client.command('WebDriver:FindElement', using='css selector', value='.card-open.foil')
            element_id = element['element-6066-11e4-a52e-4f735466cecf']
            data = client.command('WebDriver:TakeScreenshot', id=element_id, highlights=[], full=False)
            Path('/tmp/foil-firefox-element.png').write_bytes(base64.b64decode(data))
            print('screenshots /tmp/foil-firefox-listing.png /tmp/foil-firefox-element.png', flush=True)
        finally:
            if client:
                try: client.command('Marionette:Quit', flags=['eForceQuit'])
                except Exception: pass
                client.sock.close()
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait()

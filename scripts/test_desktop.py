#!/usr/bin/env python3
"""Desktop service integration: static assets, pairing, isolation and parent lifetime."""
import base64
import http.client
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
from test_codex import BrowserPeer

ROOT = Path(__file__).resolve().parents[1]


def main():
    binary = ROOT / 'target/debug/berserk-mcp'
    with tempfile.TemporaryDirectory(prefix='berserk-desktop-test-') as tmp:
        assets = Path(tmp)
        (assets / 'index.html').write_text('<h1>Bundled UI</h1>')
        (assets / 'test.wasm').write_bytes(b'\x00asm')
        env = dict(os.environ, BERSERK_WEB_ROOT=tmp, BERSERK_DESKTOP_PORT='0')

        def launch():
            process = subprocess.Popen([binary, '--app'], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            line = process.stdout.readline()
            assert line, process.stderr.read()
            return process, json.loads(line)

        process, info = launch()
        port = info['port']

        def get(path, headers=None):
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            connection.request('GET', path, headers=headers or {})
            response = connection.getresponse()
            result = response.status, dict(response.getheaders()), response.read()
            connection.close()
            return result

        try:
            assert info['origin'] == f'http://127.0.0.1:{port}'
            status, headers, body = get('/')
            assert status == 200 and b'Bundled UI' in body and info['token'].encode() not in body
            assert headers['x-content-type-options'] == 'nosniff'
            assert get('/test.wasm')[1]['content-type'] == 'application/wasm'
            assert get('/', {'Host': 'attacker.example'})[0] == 403
            assert get('/%2e%2e/Cargo.toml')[0] == 404
            assert get('/missing')[0] == 404
            ws = {'Connection': 'Upgrade', 'Upgrade': 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': base64.b64encode(os.urandom(16)).decode(), 'Origin': info['origin']}
            assert get('/bridge?token=wrong', ws)[0] == 403
            assert get('/bridge?token=' + info['token'], dict(ws, Origin='https://attacker.example'))[0] == 403
            peer = BrowserPeer(info['origin'] + f'/#agent={port}:{info["token"]}', {}, origin=info['origin'])
            peer.close()
            # EOF on the native parent's pipe shuts down the service, even after a crash.
            process.stdin.close()
            assert process.wait(timeout=10) == 0
            env['BERSERK_DESKTOP_PORT'] = str(port)
            process, fresh = launch()
            assert fresh['port'] == port and fresh['token'] != info['token']
            # A competing instance fails instead of silently moving the storage origin.
            conflict = subprocess.run([binary, '--app'], env=env, input='', text=True, capture_output=True, timeout=10)
            assert conflict.returncode != 0 and not conflict.stdout
            process.send_signal(signal.SIGTERM)
            assert process.wait(timeout=10) == 0
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
    print('PASS: bundled assets/MIME, private bootstrap, host/origin/token checks, stable origin, parent EOF and graceful shutdown')


if __name__ == '__main__':
    main()

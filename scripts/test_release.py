#!/usr/bin/env python3
"""Check packaged native binaries, offline artwork and authenticated AI service."""
import argparse
import http.client
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading


def first_line(process):
    lines = queue.Queue()
    threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
    try:
        line = lines.get(timeout=30)
    except queue.Empty:
        raise AssertionError('Packaged service did not start within 30 seconds') from None
    assert line, 'Packaged service exited without a startup message'
    return line


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    args = parser.parse_args()
    package = args.package.resolve()
    if package.suffix == '.app':
        directory = package / 'Contents/MacOS'
        assets = package / 'Contents/Resources'
        assert (directory / 'Berserk').is_file()
    else:
        directory = assets = package
        assert (directory / ('berserk.exe' if os.name == 'nt' else 'berserk')).is_file()
    binary = directory / ('berserk-mcp.exe' if os.name == 'nt' else 'berserk-mcp')
    images = [p for p in (assets / 'public/cards').rglob('*') if p.suffix in {'.jpg', '.webp', '.png'}]
    assert len(images) > 1000, 'Card images missing from package'
    assert not (assets / 'web').exists(), 'Native release must not bundle a web runtime'
    env = dict(os.environ, BERSERK_DESKTOP_PORT='0')
    with tempfile.TemporaryDirectory(prefix='berserk-release-test-') as cwd:
        process = subprocess.Popen([binary, '--native-app'], cwd=cwd, env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            info = json.loads(first_line(process))
            port, token = info['port'], info['token']
            assert info['origin'] == f'http://127.0.0.1:{port}' and len(token) == 32
            for origin, key, expected in [('http://attacker.example', token, 403),
                                          (info['origin'], '0' * 32, 403),
                                          (info['origin'], token, 101)]:
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
                connection.request('GET', f'/bridge?token={key}', headers={
                    'Origin': origin, 'Connection': 'Upgrade', 'Upgrade': 'websocket',
                    'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='})
                response = connection.getresponse()
                assert response.status == expected, (response.status, expected)
                connection.close()
            process.stdin.close()
            assert process.wait(timeout=15) == 0
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=15)
            process.stdout.close()
            if not process.stdin.closed:
                process.stdin.close()
    print('PASS: native binaries, offline artwork, token/origin isolation and parent shutdown')


if __name__ == '__main__':
    main()

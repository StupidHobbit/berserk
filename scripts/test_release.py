#!/usr/bin/env python3
"""Smoke-test the packaged service and offline assets on every release OS."""
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
        directory = package / 'Contents/Resources'
        binary = directory / 'berserk-service'
    else:
        directory = package
        binary = directory / ('berserk-mcp.exe' if os.name == 'nt' else 'berserk-mcp')
        assert (directory / ('berserk.exe' if os.name == 'nt' else 'berserk')).is_file()
    web = directory / 'web'
    assert list(web.rglob('*.wasm')), 'Wasm missing from package'
    images = [p for p in (web / 'public/cards').rglob('*') if p.suffix in {'.jpg', '.webp', '.png'}]
    assert len(images) > 1000, 'Card images missing from package'
    env = dict(os.environ, BERSERK_WEB_ROOT=str(web), BERSERK_DESKTOP_PORT='0')
    with tempfile.TemporaryDirectory(prefix='berserk-release-test-') as cwd:
        process = subprocess.Popen([binary, '--app'], cwd=cwd, env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            info = json.loads(first_line(process))
            port, token = info['port'], info['token']
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
            connection.request('GET', '/')
            response = connection.getresponse()
            body = response.read()
            assert response.status == 200 and b'<html' in body
            assert token.encode() not in body, 'Pairing secret leaked in static response'
            connection.request('GET', '/', headers={'Host': 'attacker.example'})
            response = connection.getresponse()
            assert response.status == 403
            response.read()
            wasm = next(web.glob('*.wasm')).relative_to(web).as_posix()
            connection.request('GET', '/' + wasm)
            response = connection.getresponse()
            assert response.status == 200 and response.getheader('Content-Type') == 'application/wasm'
            assert response.read(4) == b'\x00asm'
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
    print('PASS: packaged service, offline assets, Host isolation and parent shutdown')


if __name__ == '__main__':
    main()

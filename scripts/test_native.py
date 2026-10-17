#!/usr/bin/env python3
"""Open the real desktop window in an isolated profile and verify Wasm readiness."""
import argparse
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('binary', type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='berserk-gui-check-') as tmp:
    report = Path(tmp) / 'result.txt'
    result = subprocess.run([args.binary.resolve(), '--smoke-test', '--smoke-result', report],
                            cwd=tmp, timeout=120)
    message = report.read_text() if report.exists() else 'FAIL: No desktop readiness result'
    print(message)
    assert result.returncode == 0 and message.startswith('PASS:'), message

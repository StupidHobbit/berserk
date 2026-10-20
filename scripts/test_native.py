#!/usr/bin/env python3
"""Open the real desktop window in an isolated profile and verify native GPU and artwork readiness."""
import argparse
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('binary', type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='berserk-gui-check-', ignore_cleanup_errors=True) as tmp:
    report = Path(tmp) / 'result.txt'
    result = subprocess.run([args.binary.resolve(), '--smoke-test', '--smoke-result', report],
                            cwd=tmp, timeout=180, capture_output=True,
                            text=True, encoding='utf-8', errors='replace')
    print(result.stdout)
    print(result.stderr)
    print(f'Native process exit code: {result.returncode} (0x{result.returncode & 0xffffffff:08x})')
    message = report.read_text() if report.exists() else 'FAIL: No desktop readiness result'
    print(message)
    assert result.returncode == 0 and message.startswith('PASS:'), message

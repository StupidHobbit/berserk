#!/usr/bin/env python3
"""Build the macOS app; AI features use the user's existing Codex installation."""
import argparse
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-build', action='store_true', help='Reuse previously built Rust and web assets')
    args = parser.parse_args()
    if platform.system() != 'Darwin':
        parser.error('The desktop wrapper currently targets macOS.')
    if not args.skip_build:
        run('env', 'NO_COLOR=true', 'trunk', 'build', '--release', '--locked', '--dist', 'dist-release')
        run('cargo', 'build', '--release', '--locked', '--features', 'mcp', '--bin', 'berserk-mcp')
    build = ROOT / 'desktop' / 'build'
    app = build / 'Berserk.app'
    contents = app / 'Contents'
    macos, resources = contents / 'MacOS', contents / 'Resources'
    # Only generated output beneath desktop/build is replaced.
    if app.exists():
        shutil.rmtree(app)
    macos.mkdir(parents=True)
    resources.mkdir()
    run('swiftc', '-O', '-target', f'{platform.machine()}-apple-macos13.0',
        '-module-cache-path', str(build / 'swift-cache'),
        'desktop/main.swift', 'desktop/CodexInstallation.swift', '-framework', 'Cocoa', '-framework', 'WebKit',
        '-o', str(macos / 'Berserk'))
    shutil.copy2(ROOT / 'target/release/berserk-mcp', resources / 'berserk-service')
    shutil.copytree(ROOT / 'dist-release', resources / 'web')
    notices = resources / 'Notices'
    notices.mkdir()
    for name in ('LICENSE', 'NOTICE'):
        shutil.copy2(ROOT / name, notices / name)
    with (contents / 'Info.plist').open('wb') as file:
        plistlib.dump({
            'CFBundleExecutable': 'Berserk', 'CFBundleIdentifier': 'ru.berserk.collection',
            'CFBundleName': 'Berserk', 'CFBundleDisplayName': 'Berserk',
            'CFBundlePackageType': 'APPL',
            'CFBundleShortVersionString': tomllib.loads((ROOT / 'Cargo.toml').read_text())['package']['version'],
            'CFBundleVersion': '1', 'LSMinimumSystemVersion': '13.0',
            'NSHighResolutionCapable': True,
            'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
        }, file)
    run('codesign', '--force', '--deep', '--sign', '-', str(app))
    print(f'\nReady: {app}\nDouble-click Berserk.app. No terminal or separate service is needed.')


if __name__ == '__main__':
    main()

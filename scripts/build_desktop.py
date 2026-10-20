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
    parser.add_argument('--skip-build', action='store_true', help='Reuse previously built native binaries')
    args = parser.parse_args()
    if platform.system() != 'Darwin':
        parser.error('The desktop wrapper currently targets macOS.')
    if not args.skip_build:
        run('cargo', 'build', '--release', '--locked', '--no-default-features', '--features', 'desktop', '--bin', 'berserk', '--bin', 'berserk-mcp')
    build = ROOT / 'desktop' / 'build'
    app = build / 'Berserk.app'
    contents = app / 'Contents'
    macos, resources = contents / 'MacOS', contents / 'Resources'
    # Keep the last webview build available for exporting its existing profile.
    legacy = build / 'Berserk-Webview.app'
    if app.exists() and (resources / 'web').is_dir() and not legacy.exists():
        app.rename(legacy)
    elif app.exists():
        # Only generated output beneath desktop/build is replaced.
        shutil.rmtree(app)
    macos.mkdir(parents=True)
    resources.mkdir()
    shutil.copy2(ROOT / 'target/release/berserk', macos / 'Berserk')
    shutil.copy2(ROOT / 'target/release/berserk-mcp', macos / 'berserk-mcp')
    shutil.copytree(ROOT / 'public/cards', resources / 'public/cards')
    notices = resources / 'Notices'
    notices.mkdir()
    for name in ('LICENSE', 'NOTICE'):
        shutil.copy2(ROOT / name, notices / name)
    shutil.copy2(ROOT / 'assets/fonts/OFL-PTSerif.txt', notices)
    with (contents / 'Info.plist').open('wb') as file:
        plistlib.dump({
            'CFBundleExecutable': 'Berserk', 'CFBundleIdentifier': 'ru.berserk.collection',
            'CFBundleName': 'Berserk', 'CFBundleDisplayName': 'Berserk',
            'CFBundlePackageType': 'APPL',
            'CFBundleShortVersionString': tomllib.loads((ROOT / 'Cargo.toml').read_text())['package']['version'],
            'CFBundleVersion': '1', 'LSMinimumSystemVersion': '13.0',
            'NSHighResolutionCapable': True,
        }, file)
    run('codesign', '--force', '--deep', '--sign', '-', str(app))
    print(f'\nReady: {app}\nDouble-click Berserk.app. No terminal or separate service is needed.')


if __name__ == '__main__':
    main()

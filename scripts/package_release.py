#!/usr/bin/env python3
"""Package native binaries and offline assets without local user data (Python 3.11+)."""
import argparse
import hashlib
from pathlib import Path
import platform
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', required=True, choices=['macos', 'ubuntu', 'windows'])
    parser.add_argument('--arch', required=True, choices=['arm64', 'x86_64'])
    args = parser.parse_args()
    version = tomllib.loads((ROOT / 'Cargo.toml').read_text())['package']['version']
    name = f'Berserk-{version}-{args.platform}-{args.arch}'
    output = ROOT / 'release'
    output.mkdir(exist_ok=True)
    if args.platform == 'macos':
        if platform.system() != 'Darwin':
            parser.error('macOS packaging requires macOS')
        subprocess.run(['python3', 'scripts/build_desktop.py', '--skip-build'], cwd=ROOT, check=True)
        archive = output / f'{name}.zip'
        subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent',
                        str(ROOT / 'desktop/build/Berserk.app'), str(archive)], check=True)
        package = ROOT / 'desktop/build/Berserk.app'
    else:
        package = output / name
        if package.exists():
            shutil.rmtree(package)
        package.mkdir()
        extension = '.exe' if args.platform == 'windows' else ''
        for binary in ('berserk', 'berserk-mcp'):
            shutil.copy2(ROOT / f'target/release/{binary}{extension}', package)
        shutil.copytree(ROOT / 'dist-release', package / 'web')
        for document in ('LICENSE', 'NOTICE'):
            shutil.copy2(ROOT / document, package)
        (package / 'README.txt').write_text(
            f'Berserk {version}\n\n'
            f'Extract the whole archive, then run berserk{extension}.\n'
            'The app opens in your default browser. Keep the terminal window open; Ctrl+C stops the service.\n'
            'Ubuntu: run ./berserk from a desktop session (xdg-open is used to open your browser).\n'
            'Collection data is saved in this browser at http://127.0.0.1:47381. Use the same browser each time.\n'
            'Export a backup through My data before clearing browser storage or changing browser.\n'
            'All card data and images are bundled. No Rust, Python or Node is required to browse cards.\n'
            'AI features require an installed Codex CLI on PATH, signed in with codex login.\n'
            'For a custom executable set BERSERK_CODEX_BIN (on Windows use the native codex.exe).\n'
            'Only run one copy at a time; the fixed local port preserves your collection storage.\n'
            'Source and releases: https://github.com/StupidHobbit/berserk\n', encoding='utf-8')
        archive = Path(shutil.make_archive(str(output / name),
                       'zip' if args.platform == 'windows' else 'gztar', output, name))
    with archive.open('rb') as file:
        digest = hashlib.file_digest(file, 'sha256').hexdigest()
    archive.with_name(archive.name + '.sha256').write_text(f'{digest}  {archive.name}\n')
    print(f'Package: {package}\nArchive: {archive}')


if __name__ == '__main__':
    main()

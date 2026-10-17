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
            'The app opens its own desktop window. Closing it stops the local service.\n'
            'Ubuntu: install the .deb with sudo apt install ./Berserk-*.deb, then open Berserk from Applications.\n'
            'For the portable tar.gz, install libwebkit2gtk-4.1-0 and run ./berserk.\n'
            'Collection data is saved in the app profile, separately from your browser.\n'
            'Windows requires Microsoft Edge WebView2 Runtime (included with Windows 11 and most Windows 10 installations).\n'
            'Export a backup through My data before clearing the app profile.\n'
            'All card data and images are bundled. No Rust, Python or Node is required to browse cards.\n'
            'AI features require an installed Codex CLI on PATH; use the sign-in button inside Berserk.\n'
            'For a custom executable set BERSERK_CODEX_BIN (on Windows use the native codex.exe).\n'
            'Only run one copy at a time; the fixed local port preserves your collection storage.\n'
            'Source and releases: https://github.com/StupidHobbit/berserk\n', encoding='utf-8')
        archive = Path(shutil.make_archive(str(output / name),
                       'zip' if args.platform == 'windows' else 'gztar', output, name))
    archives = [archive]
    if args.platform == 'ubuntu':
        debroot = output / 'deb-root'
        if debroot.exists():
            shutil.rmtree(debroot)
        shutil.copytree(package, debroot / 'opt/berserk')
        (debroot / 'DEBIAN').mkdir()
        (debroot / 'DEBIAN/control').write_text(
            f'Package: berserk\nVersion: {version}\nArchitecture: amd64\n'
            'Maintainer: StupidHobbit <noreply@github.com>\nSection: games\nPriority: optional\n'
            'Depends: libgtk-3-0, libwebkit2gtk-4.1-0\n'
            'Homepage: https://github.com/StupidHobbit/berserk\n'
            'Description: Berserk card encyclopedia and deck builder\n')
        (debroot / 'usr/bin').mkdir(parents=True)
        (debroot / 'usr/bin/berserk').symlink_to('/opt/berserk/berserk')
        applications = debroot / 'usr/share/applications'
        applications.mkdir(parents=True)
        (applications / 'berserk.desktop').write_text(
            '[Desktop Entry]\nType=Application\nName=Berserk\nComment=Card collection and deck builder\n'
            'Exec=/opt/berserk/berserk\nIcon=applications-games\nTerminal=false\nCategories=Game;CardGame;\n')
        deb = output / f'{name}.deb'
        subprocess.run(['dpkg-deb', '--build', '--root-owner-group', str(debroot), str(deb)], check=True)
        archives.append(deb)
    for artifact in archives:
        with artifact.open('rb') as file:
            digest = hashlib.file_digest(file, 'sha256').hexdigest()
        artifact.with_name(artifact.name + '.sha256').write_text(f'{digest}  {artifact.name}\n')
    print(f'Package: {package}\nArchive: {archive}')


if __name__ == '__main__':
    main()

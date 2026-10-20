.PHONY: dev build test check mcp-build mcp-test ai desktop

dev:
	NO_COLOR=true trunk serve --address 127.0.0.1 --port 8080

build:
	NO_COLOR=true trunk build --release --locked --dist dist-release

test:
	cargo test --locked --no-default-features --features mcp
	python3 -m unittest discover -s tests -p 'test_*.py'

check:
	cargo fmt --check
	cargo clippy --locked --no-default-features --features mcp --all-targets -- -D warnings

mcp-build:
	cargo build --release --locked --no-default-features --features mcp --bin berserk-mcp

mcp-test:
	cargo test --locked --no-default-features --features mcp
	cargo build --locked --no-default-features --features mcp --bin berserk-mcp
	python3 scripts/test_mcp.py

# Local browser-driven Codex generation; no MCP host is required.
ai:
	cargo run --locked --no-default-features --features mcp --bin berserk-mcp -- --serve

# Build once; launch desktop/build/Berserk.app thereafter.
desktop:
	python3 scripts/build_desktop.py

# GPU-rendered native app on Linux, Windows and macOS.
native:
	cargo build --release --locked --no-default-features --features desktop --bin berserk --bin berserk-mcp

native-test:
	cargo test --locked --no-default-features --features desktop
	cargo clippy --locked --no-default-features --features desktop --all-targets -- -D warnings

.PHONY: dev build test check mcp-build mcp-test ai desktop

dev:
	NO_COLOR=true trunk serve --address 127.0.0.1 --port 8080

build:
	NO_COLOR=true trunk build --release --locked --dist dist-release

test:
	cargo test --locked --features mcp
	python3 -m unittest discover -s tests -p 'test_*.py'

check:
	cargo fmt --check
	cargo clippy --locked --features mcp --all-targets -- -D warnings

mcp-build:
	cargo build --release --locked --features mcp --bin berserk-mcp

mcp-test:
	cargo test --locked --features mcp
	cargo build --locked --features mcp --bin berserk-mcp
	python3 scripts/test_mcp.py

# Local browser-driven Codex generation; no MCP host is required.
ai:
	cargo run --locked --features mcp --bin berserk-mcp -- --serve

# Build once; launch desktop/build/Berserk.app thereafter.
desktop:
	python3 scripts/build_desktop.py

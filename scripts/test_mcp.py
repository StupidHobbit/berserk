#!/usr/bin/env python3
"""Exercise the real MCP stdio transport. --browser additionally pairs a real app tab.

Build first: cargo build --features mcp --bin berserk-mcp
For --browser, open the printed URL in the app browser within 120 seconds.
Uses localhost (separate storage from 127.0.0.1) and creates a named test deck.
"""
import argparse
import http.client
import json
import os
from pathlib import Path
import select
import subprocess
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

class Client:
    def __init__(self, binary, arguments=()):
        self.process = subprocess.Popen([str(binary), *arguments], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=None, env={**os.environ, "BERSERK_APP_ORIGIN": "http://localhost:8080"})
        self.sequence = 0
        self.buffer = b""
    def send(self, value):
        self.process.stdin.write((json.dumps(value) + "\n").encode())
        self.process.stdin.flush()
    def request(self, method, params=None):
        self.sequence += 1
        self.send({"jsonrpc":"2.0", "id":self.sequence, "method":method, "params":params or {}})
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if b"\n" not in self.buffer:
                ready, _, _ = select.select([self.process.stdout], [], [], max(0, deadline-time.monotonic()))
                if not ready: break
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk: raise AssertionError("MCP server exited unexpectedly")
                self.buffer += chunk
            while b"\n" in self.buffer:
                line, self.buffer = self.buffer.split(b"\n", 1)
                message = json.loads(line)
                if message.get("id") == self.sequence:
                    assert "error" not in message, message
                    return message["result"]
        raise AssertionError(f"Timeout waiting for {method}")
    def tool(self, name, arguments=None, error=False):
        result = self.request("tools/call", {"name":name, "arguments":arguments or {}})
        assert bool(result.get("isError")) == error, result
        if error: return result
        return result.get("structuredContent") or json.loads(result["content"][0]["text"])
    def close(self):
        self.process.stdin.close()
        try: self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            self.process.wait(timeout=5)

def check_bridge_auth(url):
    port, token = urlparse(url).fragment.removeprefix("agent=").split(":")
    for origin, supplied in [("https://untrusted.example", token), ("http://localhost:8080", "0"*32)]:
        connection = http.client.HTTPConnection("127.0.0.1", int(port), timeout=3)
        connection.request("GET", f"/bridge?token={supplied}", headers={"Origin":origin,"Connection":"Upgrade","Upgrade":"websocket","Sec-WebSocket-Version":"13","Sec-WebSocket-Key":"dGhlIHNhbXBsZSBub25jZQ=="})
        assert connection.getresponse().status == 403
        connection.close()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--binary",type=Path,default=ROOT/"target/debug/berserk-mcp")
    parser.add_argument("--browser",action="store_true")
    args=parser.parse_args()
    client=Client(args.binary)
    try:
        init=client.request("initialize",{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"berserk-integration-test","version":"1"}})
        assert "tools" in init["capabilities"]
        client.send({"jsonrpc":"2.0","method":"notifications/initialized"})
        names={t["name"] for t in client.request("tools/list")["tools"]}
        assert names == {"connection_info","catalog_info","search_cards","get_card","get_collection","list_decks","get_deck","validate_deck","save_deck","get_deck_build_prompt","create_deck_with_codex","get_deck_build_status","cancel_deck_build","deal_deck","refine_deck_with_codex"}, names
        prompt = client.tool("get_deck_build_prompt", {"size":40,"preferences":"Лес"})
        assert "40" in prompt["prompt"] and "Лес" in prompt["prompt"]
        client.tool("get_deck_build_prompt", {"size":29}, error=True)
        assert not client.tool("get_deck_build_status")["phase"]
        client.tool("create_deck_with_codex", error=True)
        client.tool("cancel_deck_build", {"id":"missing"}, error=True)
        assert client.tool("catalog_info")["card_records"] == 2630
        result=client.tool("search_cards",{"set_id":80,"color":1,"limit":30})
        assert result["total"]>10 and len(result["cards"])==30
        card=result["cards"][0]
        assert client.tool("get_card",{"id":card["id"]})["name"]==card["name"]
        client.tool("get_card",{"id":"missing"},error=True)
        client.tool("search_cards",{"limit":101},error=True)
        client.tool("get_collection",error=True)
        client.tool("save_deck",{"name":"invalid","cards":[{"id":"missing","count":1}]},error=True)
        picks=[]
        seen=set()
        for c in result["cards"]:
            if c["name"] not in seen and not c["banned"]:
                picks.append({"id":c["id"],"count":3});seen.add(c["name"])
            if len(picks)==10: break
        proposal={"name":"MCP · Проверка интеграции","cards":picks,"side":[],"tags":["MCP test"],"description":"Описание тестовой колоды","how_to_play":"Набор отряда\nПервые ходы","improvements":"Карта вне коллекции: польза и замена"}
        report=client.tool("validate_deck",proposal)
        assert report["basic_constructed_ok"], report
        pair=client.tool("connection_info")
        check_bridge_auth(pair["connect_url"])
        print("PASS: MCP handshake, discovery, catalog, validation, errors, and bridge authorization",flush=True)
        if not args.browser: return
        print("CONNECT_URL="+pair["connect_url"],flush=True)
        deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            if client.tool("connection_info")["connected"]: break
            time.sleep(1)
        else: raise AssertionError("No browser connected")
        before=client.tool("list_decks")["decks"]
        collection=client.tool("get_collection")
        created=client.tool("save_deck",proposal)["saved"]
        deck=created["deck"]
        assert deck["id"] not in {d["id"] for d in before}
        read=client.tool("get_deck",{"id":deck["id"]})
        assert read["deck"]["description"]==proposal["description"]
        assert read["deck"]["how_to_play"]==proposal["how_to_play"]
        assert read["deck"]["improvements"]==proposal["improvements"]
        assert read["deck"]["cards"]==deck["cards"] and read["export_text"].startswith("# MCP")
        update={**proposal,"name":"MCP · Колода из Сердца роя","deck_id":deck["id"],"expected_revision":read["revision"]}
        update.pop("description")
        update.pop("how_to_play")
        update.pop("improvements")
        client.tool("save_deck",update)
        client.tool("save_deck",update,error=True)
        assert client.tool("get_collection")==collection
        assert len(client.tool("list_decks")["decks"])==len(before)+1
        read=client.tool("get_deck",{"id":deck["id"]})
        assert read["deck"]["name"]==update["name"]
        assert read["deck"]["description"]==proposal["description"]
        assert read["deck"]["how_to_play"]==proposal["how_to_play"]
        assert read["deck"]["improvements"]==proposal["improvements"]
        print("PASS: live collection, create/update, readback/export, stale revision rejection, collection preservation",flush=True)
        print("TEST_DECK_ID="+deck["id"],flush=True)
        # Keep the connection alive for UI verification and Undo. End with Ctrl-C.
        while args.browser: time.sleep(1)
    finally: client.close()
if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: pass

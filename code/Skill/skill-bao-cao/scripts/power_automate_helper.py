"""Helper module hỗ trợ AI Agent và Python tương tác với Power Automate qua Flow Studio MCP."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

FLOWSTUDIO_MCP_ENDPOINT = "https://mcp.flowstudio.app/mcp"


def call_flowstudio_mcp(tool_name: str, arguments: dict[str, Any], token: str | None = None) -> Any:
    """Gọi công cụ MCP của Flow Studio Power Automate."""
    api_token = token or os.getenv("FLOWSTUDIO_MCP_TOKEN")
    if not api_token:
        raise ValueError("Chưa cấu hình FLOWSTUDIO_MCP_TOKEN. Vui lòng đặt biến môi trường hoặc truyền token.")

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "id": 1,
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }

    req = urllib.request.Request(
        FLOWSTUDIO_MCP_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-api-key": api_token,
            "Content-Type": "application/json",
            "User-Agent": "Vikoda-Agent-MCP/1.0",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
            if "error" in raw:
                raise RuntimeError(f"Lỗi MCP: {json.dumps(raw['error'])}")
            text = raw["result"]["content"][0]["text"]
            return json.loads(text)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Lỗi HTTP {e.code}: {body[:200]}") from e

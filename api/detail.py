import json
import os
import sys
import http.server
from urllib.parse import parse_qs, urlparse

API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from db import load_data

class Handler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002
        return

    def _query_params(self) -> dict[str, list[str]]:
        parsed = urlparse(self.path or "")
        return parse_qs(parsed.query or "")

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        try:
            qs = self._query_params()
            slug = (qs.get("slug") or [None])[0]
            if not slug:
                return self._send_json(
                    400, {"success": False, "error": "slug required"}
                )

            data = load_data()
            anime = next((a for a in data if a.get("slug") == slug), None)
            if not anime:
                return self._send_json(
                    404, {"success": False, "error": "Not found"}
                )

            return self._send_json(200, {"success": True, "data": anime})
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

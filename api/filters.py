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
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        try:
            data = load_data()
            genres = set()
            statuses = set()
            types = set()
            for anime in data:
                for g in (anime.get("genre") or []):
                    if g and str(g).strip():
                        genres.add(str(g).strip())
                s = anime.get("status") or ""
                if s:
                    statuses.add(str(s).strip())
                t = anime.get("type") or ""
                if t:
                    types.add(str(t).strip())
            return self._send_json(200, {
                "success": True,
                "data": {
                    "genres": sorted(genres),
                    "statuses": sorted(statuses),
                    "types": sorted(types),
                },
            })
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

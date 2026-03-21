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

    def _filter_data(self, data: list, qs: dict) -> list:
        q = (qs.get("q") or [""])[0].strip().lower()
        genre = (qs.get("genre") or [""])[0].strip()
        status = (qs.get("status") or [""])[0].strip()
        type_ = (qs.get("type") or [""])[0].strip()
        for a in data:
            if q and q not in (a.get("title_lower") or a.get("title", "") or "").lower():
                continue
            if genre and genre not in (a.get("genre") or []):
                continue
            if status and (a.get("status") or "").strip() != status:
                continue
            if type_ and (a.get("type") or "").strip() != type_:
                continue
            yield a

    def do_GET(self) -> None:
        try:
            data = load_data()
            qs = self._query_params()
            results = list(self._filter_data(data, qs))
            return self._send_json(
                200,
                {"success": True, "data": results, "total": len(results)},
            )
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

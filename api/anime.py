import json
import os
import sys
import http.server
from urllib.parse import parse_qs, urlparse

# Vercel @vercel/python menjalankan file per-route, jadi folder `api/` tidak
# selalu dianggap sebagai package. Pakai sys.path biar import `db.py` stabil.
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
            data = load_data()
            qs = self._query_params()
            page_raw = (qs.get("page") or ["1"])[0]
            limit_raw = (qs.get("limit") or ["50"])[0]
            page = int(page_raw)
            limit = int(limit_raw)
            if page < 1 or limit < 1:
                return self._send_json(400, {"success": False, "error": "invalid page/limit"})

            start = (page - 1) * limit
            end = start + limit
            paginated = data[start:end]

            self._send_json(
                200,
                {
                    "success": True,
                    "data": paginated,
                    "total": len(data),
                    "page": page,
                    "limit": limit,
                },
            )
        except Exception as e:
            self._send_json(500, {"success": False, "error": str(e)})

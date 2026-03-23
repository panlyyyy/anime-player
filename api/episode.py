import json
import os
import sys
import time
import http.server
from urllib.parse import parse_qs, urlparse, unquote

# Stabilkan import di runtime serverless (Vercel) yang tidak selalu menganggap
# folder `api/` sebagai package.
API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from db import get_episode_data
from scraper import extract_episode_media_from_page

MEDIA_CACHE = {}
MEDIA_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 jam

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
            raw = (qs.get("url") or [None])[0]
            url = unquote(raw) if raw else None
            number_raw = (qs.get("number") or [None])[0]
            if not url:
                return self._send_json(
                    400, {"success": False, "error": "url required"}
                )

            episode_number = None
            if number_raw not in (None, ""):
                try:
                    episode_number = int(number_raw)
                except ValueError:
                    return self._send_json(
                        400, {"success": False, "error": "invalid episode number"}
                    )

            # 1) Coba dari DB statis (jika sudah pernah di-scrape dan sources terisi)
            data = get_episode_data(url, episode_number) or {}
            sources = data.get("sources", {}) if isinstance(data, dict) else {}
            default_q = (
                data.get("default", "360p") if isinstance(data, dict) else "360p"
            )

            if sources and isinstance(sources, dict) and len(sources) > 0:
                return self._send_json(
                    200,
                    {
                        "success": True,
                        "sources": sources,
                        "streams": {},
                        "default": default_q,
                        "url": url,
                    },
                )

            # 2) Kalau kosong, scrape ulang halaman episode untuk dapat video + stream
            now = time.time()
            cache_key = f"{url}::{episode_number}" if episode_number is not None else url
            cached = MEDIA_CACHE.get(cache_key)
            if cached and (now - cached.get("ts", 0)) < MEDIA_CACHE_TTL_SECONDS:
                payload = cached.get("payload") or {}
                return self._send_json(200, payload)

            media = extract_episode_media_from_page(url, episode_number)
            if not media:
                media = extract_episode_media_from_page(url, episode_number)  # Retry sekali
            # Fallback domain: coba.oploverz.ltd -> anime.oploverz.ac (banyak episode hanya ada di .ac)
            if (not media or (not media.get("videos") and not media.get("streams"))) and "coba.oploverz.ltd" in url:
                alt_url = url.replace("coba.oploverz.ltd", "anime.oploverz.ac")
                media = extract_episode_media_from_page(alt_url, episode_number)
            if not media or (not media.get("videos") and not media.get("streams")):
                return self._send_json(
                    404, {"success": False, "error": "Episode not found"}
                )

            payload = {
                "success": True,
                "sources": media.get("videos", {}) or {},
                "streams": media.get("streams", {}) or {},
                "default": media.get("default") or default_q,
                "number": media.get("number"),
                "url": url,
            }

            MEDIA_CACHE[cache_key] = {"ts": now, "payload": payload}
            return self._send_json(200, payload)
        except Exception as e:
            return self._send_json(500, {"success": False, "error": str(e)})

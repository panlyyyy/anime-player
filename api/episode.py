import os
import sys
import time

# Stabilkan import di runtime serverless (Vercel) yang tidak selalu menganggap
# folder `api/` sebagai package.
API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from db import get_episode_data
from http_utils import JsonHandler
from scraper import extract_episode_sources

MEDIA_CACHE = {}
MEDIA_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 jam


class handler(JsonHandler):
    def do_GET(self):
        try:
            params = self.get_query_params()
            url = params.get("url")
            if not url:
                self.send_json({"success": False, "error": "url required"}, status=400)
                return

            # 1) Coba dari DB statis (jika sudah pernah di-scrape dan sources terisi)
            data = get_episode_data(url) or {}
            sources = data.get("sources", {}) if isinstance(data, dict) else {}
            default_q = data.get("default", "360p") if isinstance(data, dict) else "360p"

            if sources and isinstance(sources, dict) and len(sources) > 0:
                self.send_json(
                    {
                        "success": True,
                        "sources": sources,
                        "streams": {},
                        "default": default_q,
                        "url": url,
                    }
                )
                return

            # 2) Kalau kosong, scrape ulang halaman episode untuk dapat video + stream
            now = time.time()
            cached = MEDIA_CACHE.get(url)
            if cached and (now - cached.get("ts", 0)) < MEDIA_CACHE_TTL_SECONDS:
                payload = cached.get("payload") or {}
                self.send_json(payload)
                return

            media = extract_episode_sources(url)
            if not media:
                self.send_json({"success": False, "error": "Episode not found"}, status=404)
                return

            payload = {
                "success": True,
                "sources": media.get("videos", {}) or {},
                "streams": media.get("streams", {}) or {},
                "default": media.get("default") or default_q,
                "url": url,
            }

            MEDIA_CACHE[url] = {"ts": now, "payload": payload}
            self.send_json(payload)
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

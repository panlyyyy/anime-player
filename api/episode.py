import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from db import get_episode_data
from scraper import extract_episode_sources

MEDIA_CACHE = {}
MEDIA_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 jam


def _parse_query(path: str) -> dict:
    parsed = urlparse(path)
    raw = parse_qs(parsed.query)
    return {k: (v[0] if isinstance(v, list) and v else '') for k, v in raw.items()}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        headers_origin = '*'
        try:
            params = _parse_query(self.path)
            url = params.get('url', '')
            if not url:
                body = json.dumps({'success': False, 'error': 'url required'}, ensure_ascii=False).encode('utf-8')
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', headers_origin)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # 1) Coba dari DB statis (jika sudah pernah di-scrape dan sources terisi)
            data = get_episode_data(url) or {}
            sources = data.get('sources', {}) if isinstance(data, dict) else {}
            default_q = data.get('default', '360p') if isinstance(data, dict) else '360p'

            if sources and isinstance(sources, dict) and len(sources) > 0:
                payload = {
                    'success': True,
                    'sources': sources,
                    'streams': {},
                    'default': default_q,
                    'url': url
                }
                body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', headers_origin)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # 2) Kalau kosong, scrape ulang halaman episode untuk dapat video + stream
            now = time.time()
            cached = MEDIA_CACHE.get(url)
            if cached and (now - cached.get('ts', 0)) < MEDIA_CACHE_TTL_SECONDS:
                payload = cached.get('payload') or {}
                body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', headers_origin)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            media = extract_episode_sources(url)
            if not media:
                body = json.dumps({'success': False, 'error': 'Episode not found'}, ensure_ascii=False).encode('utf-8')
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', headers_origin)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            payload = {
                'success': True,
                'sources': media.get('videos', {}) or {},
                'streams': media.get('streams', {}) or {},
                'default': media.get('default') or default_q,
                'url': url
            }

            MEDIA_CACHE[url] = {'ts': now, 'payload': payload}

            body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', headers_origin)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', headers_origin)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

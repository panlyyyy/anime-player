import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from db import load_data


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
            q = (params.get('q') or '').strip().lower()
            if not q:
                payload = {'success': True, 'data': []}
            else:
                data = load_data()
                results = [a for a in data if q in a['title_lower']]
                payload = {'success': True, 'data': results, 'total': len(results)}

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

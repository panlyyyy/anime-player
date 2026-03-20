import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


class JsonHandler(BaseHTTPRequestHandler):
    def get_query_params(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query, keep_blank_values=True)
        return {key: values[-1] if values else "" for key, values in params.items()}

    def send_json(self, payload, status=200, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        merged_headers = dict(DEFAULT_HEADERS)
        if headers:
            merged_headers.update(headers)

        self.send_response(status)
        for key, value in merged_headers.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        for key, value in DEFAULT_HEADERS.items():
            self.send_header(key, value)
        self.end_headers()


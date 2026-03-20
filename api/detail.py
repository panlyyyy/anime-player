import os
import sys

API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from db import load_data
from http_utils import JsonHandler


class handler(JsonHandler):
    def do_GET(self):
        try:
            params = self.get_query_params()
            slug = params.get("slug")
            if not slug:
                self.send_json({"success": False, "error": "slug required"}, status=400)
                return

            data = load_data()
            anime = next((a for a in data if a["slug"] == slug), None)
            if not anime:
                self.send_json({"success": False, "error": "Not found"}, status=404)
                return

            self.send_json({"success": True, "data": anime})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

import json
import os
import sys

API_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from http_utils import JsonHandler
from db import load_data

class handler(JsonHandler):
    def do_GET(self):
        try:
            params = self.get_query_params()
            q = params.get('q', '').strip().lower()
            if not q:
                self.send_json({'success': True, 'data': []})
                return

            data = load_data()
            results = [a for a in data if q in a['title_lower']]
            self.send_json({
                'success': True,
                'data': results,
                'total': len(results)
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

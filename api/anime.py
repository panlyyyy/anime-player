import json
import os
import sys

# Vercel @vercel/python menjalankan file per-route, jadi folder `api/` tidak
# selalu dianggap sebagai package. Pakai sys.path biar import `db.py` stabil.
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
            data = load_data()
            params = self.get_query_params()
            page = int(params.get('page', 1))
            limit = int(params.get('limit', 50))
            start = (page - 1) * limit
            end = start + limit
            paginated = data[start:end]
            self.send_json({
                'success': True,
                'data': paginated,
                'total': len(data),
                'page': page,
                'limit': limit
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

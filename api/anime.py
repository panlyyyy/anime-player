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

from db import load_data

def handler(request):
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    }
    if request.method == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    try:
        data = load_data()
        params = request.query_params or {}
        page = int(params.get('page', 1))
        limit = int(params.get('limit', 50))
        start = (page - 1) * limit
        end = start + limit
        paginated = data[start:end]
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'data': paginated,
                'total': len(data),
                'page': page,
                'limit': limit
            }, ensure_ascii=False)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }

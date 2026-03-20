import json
import os
import sys

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
        params = request.query_params or {}
        q = params.get('q', '').strip().lower()
        if not q:
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'success': True, 'data': []})
            }
        data = load_data()
        results = [a for a in data if q in a['title_lower']]
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'data': results,
                'total': len(results)
            }, ensure_ascii=False)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }

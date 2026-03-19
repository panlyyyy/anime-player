import json
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
        slug = params.get('slug')
        if not slug:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'success': False, 'error': 'slug required'})
            }
        data = load_data()
        anime = next((a for a in data if a['slug'] == slug), None)
        if not anime:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'success': False, 'error': 'Not found'})
            }
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'success': True, 'data': anime}, ensure_ascii=False)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }
import json
from db import get_episode_data

def handler(request):
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    }
    if request.method == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    try:
        params = request.query_params or {}
        url = params.get('url')
        if not url:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'success': False, 'error': 'url required'})
            }
        data = get_episode_data(url)
        if data:
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'sources': data.get('sources', {}),
                    'default': data.get('default', '360p'),
                    'url': url
                })
            }
        else:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'success': False, 'error': 'Episode not found'})
            }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }
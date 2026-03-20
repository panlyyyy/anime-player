import json
import time

try:
    from .db import get_episode_data
except ImportError:
    from db import get_episode_data

try:
    from scraper import extract_episode_sources
except ImportError:
    # fallback jika environment mengatur import berbeda
    from ..scraper import extract_episode_sources  # type: ignore

MEDIA_CACHE = {}
MEDIA_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 jam

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

        # 1) Coba dari DB statis (jika sudah pernah di-scrape dan sources terisi)
        data = get_episode_data(url) or {}
        sources = data.get('sources', {}) if isinstance(data, dict) else {}
        default_q = data.get('default', '360p') if isinstance(data, dict) else '360p'

        if sources and isinstance(sources, dict) and len(sources) > 0:
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'sources': sources,
                    'streams': {},
                    'default': default_q,
                    'url': url
                }, ensure_ascii=False)
            }

        # 2) Kalau kosong, scrape ulang halaman episode untuk dapat video + stream
        now = time.time()
        cached = MEDIA_CACHE.get(url)
        if cached and (now - cached.get('ts', 0)) < MEDIA_CACHE_TTL_SECONDS:
            payload = cached.get('payload') or {}
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(payload, ensure_ascii=False)
            }

        media = extract_episode_sources(url)
        if not media:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'success': False, 'error': 'Episode not found'})
            }

        payload = {
            'success': True,
            'sources': media.get('videos', {}) or {},
            'streams': media.get('streams', {}) or {},
            'default': media.get('default') or default_q,
            'url': url
        }

        MEDIA_CACHE[url] = {'ts': now, 'payload': payload}

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(payload, ensure_ascii=False)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'success': False, 'error': str(e)})
        }

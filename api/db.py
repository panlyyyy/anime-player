import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / 'public' / 'data' / 'anime_master.json'
CACHE = None
CACHE_MTIME = 0
EPISODE_MAP = {}

def load_data():
    global CACHE, CACHE_MTIME, EPISODE_MAP
    try:
        mtime = DATA_FILE.stat().st_mtime
    except OSError:
        return []
    if CACHE and mtime == CACHE_MTIME:
        return CACHE
    try:
        with DATA_FILE.open('r', encoding='utf-8') as f:
            data = json.load(f).get('data', [])
        CACHE = data
        CACHE_MTIME = mtime
        EPISODE_MAP.clear()
        for anime in data:
            for ep in anime.get('episodes', []):
                EPISODE_MAP[ep['url']] = {
                    'sources': ep.get('sources', {}),
                    'default': ep.get('default', '360p')
                }
        return CACHE
    except Exception as e:
        print(f"DB error: {e}")
        return []

def get_episode_data(url):
    if not EPISODE_MAP:
        load_data()
    return EPISODE_MAP.get(url)

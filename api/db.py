import json
import os
import time

DATA_FILE = os.path.join(os.getcwd(), 'public', 'data', 'anime_master.json')
CACHE = None
CACHE_MTIME = 0
EPISODE_MAP = {}

def load_data():
    global CACHE, CACHE_MTIME, EPISODE_MAP
    try:
        mtime = os.path.getmtime(DATA_FILE)
    except OSError:
        return []
    if CACHE and mtime == CACHE_MTIME:
        return CACHE
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
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
    return EPISODE_MAP.get(url)
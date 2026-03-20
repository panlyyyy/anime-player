import json
from pathlib import Path
import os

import requests

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / 'public' / 'data' / 'anime_master.json'
CACHE = None
CACHE_MTIME = 0
EPISODE_MAP = {}

def _fetch_static_data() -> list:
    """
    Fallback untuk skenario Vercel: file lokal tidak ikut ke bundle.
    Ambil lewat HTTP ke static route: `/data/anime_master.json`.
    """
    vercel_url = os.environ.get("VERCEL_URL")
    if not vercel_url:
        return []

    url = os.environ.get("ANIME_MASTER_URL")
    if not url:
        url = f"https://{vercel_url}/data/anime_master.json"

    try:
        res = requests.get(url, timeout=20)
        res.raise_for_status()
        payload = res.json()
        data = payload.get("data", [])
        return data if isinstance(data, list) else []
    except Exception:
        return []

def load_data():
    global CACHE, CACHE_MTIME, EPISODE_MAP
    try:
        mtime = DATA_FILE.stat().st_mtime
        use_local = True
    except OSError:
        use_local = False
        mtime = 0

    # Kalau sudah pernah berhasil load dari local atau fallback, jangan hit endpoint lagi.
    if CACHE and (use_local is False or mtime == CACHE_MTIME):
        return CACHE

    if not use_local:
        data = _fetch_static_data()
        CACHE = data
        CACHE_MTIME = -1
        EPISODE_MAP.clear()
        for anime in data:
            for ep in anime.get('episodes', []):
                EPISODE_MAP[ep['url']] = {
                    'sources': ep.get('sources', {}),
                    'default': ep.get('default', '360p')
                }
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

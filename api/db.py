import json
from pathlib import Path
import os

import requests

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / 'public' / 'data' / 'anime_master.json'
CACHE = None
CACHE_MTIME = 0
EPISODE_MAP = {}
EPISODE_URL_MAP = {}


def _episode_map_key(url, number=None):
    url = (url or '').strip()
    if not url:
        return ''
    if number is None:
        return url
    try:
        return f'{url}::{int(number)}'
    except (TypeError, ValueError):
        return url


def _rebuild_episode_maps(data):
    EPISODE_MAP.clear()
    EPISODE_URL_MAP.clear()

    url_counts = {}
    for anime in data:
        for ep in anime.get('episodes', []) or []:
            url = (ep.get('url') or '').strip()
            if not url:
                continue
            url_counts[url] = url_counts.get(url, 0) + 1

    for anime in data:
        for ep in anime.get('episodes', []) or []:
            url = (ep.get('url') or '').strip()
            if not url:
                continue

            payload = {
                'sources': ep.get('sources', {}),
                'default': ep.get('default', '360p'),
                'number': ep.get('number'),
            }

            number = ep.get('number')
            EPISODE_MAP[_episode_map_key(url, number)] = payload

            if url_counts.get(url) == 1:
                EPISODE_URL_MAP[url] = payload

def _fetch_static_data() -> list:
    """
    Fallback untuk skenario Vercel: file lokal tidak ikut ke bundle.
    Ambil lewat HTTP ke static route: `/data/anime_master.json`.
    """
    url = os.environ.get("ANIME_MASTER_URL")
    if url:
        url = url.strip()
        if not url:
            url = None

    host_candidates = [
        os.environ.get("VERCEL_URL"),
        os.environ.get("VERCEL_PROJECT_PRODUCTION_URL"),
        os.environ.get("VERCEL_DEPLOYMENT_URL"),
        os.environ.get("VERCEL_BRANCH_URL"),
    ]
    host_candidates = [h for h in host_candidates if h]

    # Try explicit ANIME_MASTER_URL first, otherwise try common Vercel host env vars.
    urls_to_try: list[str] = []
    if url:
        urls_to_try.append(url)
    for host in host_candidates:
        if host.startswith("http://") or host.startswith("https://"):
            urls_to_try.append(host.rstrip("/") + "/data/anime_master.json")
        else:
            urls_to_try.append(f"https://{host}/data/anime_master.json")

    if not urls_to_try:
        return []

    last_err = None
    for candidate in urls_to_try:
        try:
            res = requests.get(
                candidate,
                timeout=20,
                headers={"Accept": "application/json"},
            )
            if not res.ok:
                last_err = f"HTTP {res.status_code}"
                continue

            payload = res.json()
            # payload bentuk yang diharapkan: {"data":[...]}.
            if isinstance(payload, dict):
                data = payload.get("data", [])
            elif isinstance(payload, list):
                data = payload
            else:
                data = []

            return data if isinstance(data, list) else []
        except Exception as e:
            last_err = str(e)
            continue

    # Kalau semua gagal, log error terakhir biar bisa di-debug dari Vercel logs.
    try:
        print(f"[db] Failed to load static anime_master.json. last_err={last_err}")
    except Exception:
        pass
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
        _rebuild_episode_maps(data)
        return CACHE
    try:
        with DATA_FILE.open('r', encoding='utf-8') as f:
            data = json.load(f).get('data', [])
        CACHE = data
        CACHE_MTIME = mtime
        _rebuild_episode_maps(data)
        return CACHE
    except Exception as e:
        print(f"DB error: {e}")
        return []

def get_episode_data(url, number=None):
    if not EPISODE_MAP and not EPISODE_URL_MAP:
        load_data()

    keyed = _episode_map_key(url, number)
    if keyed in EPISODE_MAP:
        return EPISODE_MAP.get(keyed)

    return EPISODE_URL_MAP.get((url or '').strip())

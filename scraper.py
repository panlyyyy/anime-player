#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nimegami Anime Scraper - Complete Version
Scrapes anime list, details, episodes, and trailers from nimegami.id
"""

import requests
from bs4 import BeautifulSoup
import base64
import json
import re
import time
import os
import random
import shutil
import argparse
import logging
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs
from typing import Optional, Dict, List, Any
import hashlib

# ============ KONFIGURASI ============
BASE_URL = "https://nimegami.id"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Connection": "keep-alive",
}

# Konstanta file & logging
LOG_DIR = "logs"
DATA_DIR = "public/data"
COUNT_FILE = os.path.join(LOG_DIR, "last_total_nimegami.txt")
DB_PATH = os.path.join(DATA_DIR, "anime_master_nimegami.json")
EXPECTED_MIN_ANIME = 500
EXPECTED_MIN_WITH_EPISODES_RATIO = 0.5

# Ekstensi file
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'}
VIDEO_EXTENSIONS = {'.mp4', '.m3u8', '.mkv', '.webm', '.avi', '.mov', '.flv'}
STREAM_HINTS = {'4meplayer', 'video.g', 'player.', 'embed.', 'stream.', 'vidcdn', 'gdrive', 'youtube', 'drive.google', 'berkasdrive', 'mitedrive', 'krakenfiles', 'racaty'}
DOWNLOAD_PAGE_HOSTS = {'mediafire.com', 'zippyshare.com', 'solidfiles.com', 'mega.nz', 'drive.google.com'}

# Setup logging
try:
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)
except OSError:
    # Read-only filesystem (e.g., Vercel serverless)
    pass

logging.basicConfig(
    filename=os.path.join(LOG_DIR, "nimegami_scraper.log") if os.path.isdir(LOG_DIR) else None,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    encoding="utf-8",
    filemode='a'
)
console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
logging.getLogger().addHandler(console)
logger = logging.getLogger(__name__)


# ============ FUNGSI UTILITAS ============

def clean(text: Optional[str]) -> str:
    """Bersihkan teks dari whitespace berlebih."""
    if not text:
        return ""
    return ' '.join(text.strip().split())

def get_soup(url: str, retries: int = 3, timeout: int = 20) -> Optional[BeautifulSoup]:
    """Mengambil dan parse HTML dari URL dengan retry mechanism."""
    for attempt in range(retries):
        try:
            logger.debug(f"Request ke {url} (attempt {attempt + 1}/{retries})")
            res = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
            res.raise_for_status()
            res.encoding = 'utf-8'
            return BeautifulSoup(res.text, 'html.parser')
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout ({attempt + 1}/{retries}): {url}")
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection error ({attempt + 1}/{retries}): {url}")
        except requests.exceptions.HTTPError as e:
            logger.warning(f"HTTP error {e.response.status_code} ({attempt + 1}/{retries}): {url}")
        except Exception as e:
            logger.warning(f"Error umum ({attempt + 1}/{retries}): {e}")
        
        if attempt < retries - 1:
            wait_time = 2 ** attempt + random.uniform(0, 1)
            logger.info(f"Menunggu {wait_time:.1f} detik sebelum retry...")
            time.sleep(wait_time)
    
    logger.error(f"Gagal mengambil {url} setelah {retries} percobaan")
    return None

def looks_like_image_url(url: str) -> bool:
    """Cek apakah URL kemungkinan adalah gambar."""
    if not url:
        return False
    lower = url.lower().split('?')[0].split('#')[0]
    return any(lower.endswith(ext) for ext in IMAGE_EXTENSIONS)

def looks_like_direct_video_url(url: str) -> bool:
    """Cek apakah URL kemungkinan adalah video langsung."""
    if not url:
        return False
    lower = url.lower().split('?')[0].split('#')[0]
    if any(lower.endswith(ext) for ext in VIDEO_EXTENSIONS):
        return True
    if re.search(r'\.(mp4|m3u8)(\b|$)', lower, re.IGNORECASE):
        return True
    return False

def is_download_page_url(url: str) -> bool:
    """Cek apakah URL adalah halaman download (bukan video langsung)."""
    if not url:
        return False
    lower = url.lower()
    return any(host in lower for host in DOWNLOAD_PAGE_HOSTS)

def extract_youtube_video_id(url: str) -> Optional[str]:
    """Ekstrak video ID YouTube dari berbagai format URL."""
    if not url or 'youtube' not in url.lower():
        return None
    
    # Format: youtube.com/embed/VIDEO_ID
    match = re.search(r'youtube\.com/embed/([a-zA-Z0-9_-]{11})', url)
    if match:
        return match.group(1)
    
    # Format: youtube.com/watch?v=VIDEO_ID
    match = re.search(r'[?&]v=([a-zA-Z0-9_-]{11})', url)
    if match:
        return match.group(1)
    
    # Format: youtu.be/VIDEO_ID
    match = re.search(r'youtu\.be/([a-zA-Z0-9_-]{11})', url)
    if match:
        return match.group(1)
    
    return None

def validate_video_url(url: str, skip_head_request: bool = True) -> bool:
    """
    Validasi URL video dengan pendekatan lebih fleksibel.
    
    Args:
        url: URL yang akan divalidasi
        skip_head_request: Jika True, skip HEAD request (lebih cepat, lebih toleran)
    
    Returns:
        True jika URL dianggap valid untuk streaming
    """
    if not url:
        return False
    
    lower = url.lower()
    
    # Tolak jika terlihat seperti gambar
    if looks_like_image_url(url):
        return False
    
    # Terima jika mengandung hint streaming yang valid
    trusted_hosts = {'berkasdrive.com', 'mitedrive.com', 'krakenfiles.com', 
                     'racaty.com', 'files.im', 'gdrive', 'youtube.com', 'youtu.be'}
    if any(host in lower for host in trusted_hosts):
        logger.debug(f"✓ Trusted host: {url[:80]}...")
        return True
    
    if any(hint in lower for hint in STREAM_HINTS):
        logger.debug(f"✓ Stream hint detected: {url[:80]}...")
        return True
    
    # Terima jika ekstensi video langsung
    if looks_like_direct_video_url(url):
        logger.debug(f"✓ Direct video extension: {url[:80]}...")
        return True
    
    # Jika skip_head_request, anggap valid untuk URL yang tidak jelas
    if skip_head_request:
        logger.debug(f"✓ Fallback accept (skip_head_request=True): {url[:80]}...")
        return True
    
    # Fallback: HEAD request untuk cek content-type
    try:
        res = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
        ctype = (res.headers.get('content-type') or '').lower()
        # Terima video/* atau application/octet-stream (common untuk download)
        is_valid = 'video/' in ctype or 'application/octet-stream' in ctype
        logger.debug(f"HEAD request: {url[:60]}... | Content-Type: {ctype} | Valid: {is_valid}")
        return is_valid
    except Exception as e:
        # Jika error, lebih aman menerima daripada menolak (false negative)
        logger.debug(f"HEAD request failed for {url[:60]}...: {e} → accepting as fallback")
        return True

def guess_quality(text_or_url: str) -> Optional[str]:
    """Tebak kualitas/resolusi dari teks atau URL."""
    if not text_or_url:
        return None
    t = text_or_url.lower()
    
    # Prioritas dari tertinggi ke terendah
    quality_map = [
        (r'(?:^|\W)2160p(?:\W|$)|\b4k\b|\buhd\b', '4k'),
        (r'\bfhd\b', '1080p'),
        (r'(?:^|\W)1080p(?:\W|$)', '1080p'),
        (r'(?:^|\W)720p(?:\W|$)|\bhd\b', '720p'),
        (r'(?:^|\W)480p(?:\W|$)', '480p'),
        (r'(?:^|\W)360p(?:\W|$)|\bsd\b', '360p'),
        (r'(?:^|\W)240p(?:\W|$)', '240p'),
    ]
    
    for pattern, quality in quality_map:
        if re.search(pattern, t):
            return quality
    return None

def extract_trailer(soup: BeautifulSoup) -> Optional[Dict[str, str]]:
    """
    Ekstrak trailer dari elemen <div class="trailer" id="Trailer">.
    
    Returns:
        Dict dengan keys: 'url', 'embed_url', 'video_id', 'platform'
        atau None jika tidak ditemukan
    """
    trailer_div = soup.find('div', class_='trailer', id='Trailer')
    if not trailer_div:
        return None
    
    iframe = trailer_div.find('iframe')
    if not iframe or not iframe.get('src'):
        return None
    
    src = iframe['src'].strip()
    
    # Deteksi platform
    platform = 'unknown'
    video_id = None
    
    if 'youtube' in src.lower() or 'youtu.be' in src.lower():
        platform = 'youtube'
        video_id = extract_youtube_video_id(src)
    elif 'vimeo' in src.lower():
        platform = 'vimeo'
        match = re.search(r'vimeo\.com/(?:video/)?(\d+)', src)
        video_id = match.group(1) if match else None
    elif 'dailymotion' in src.lower():
        platform = 'dailymotion'
        match = re.search(r'dailymotion\.com/(?:embed/)?video/([a-zA-Z0-9]+)', src)
        video_id = match.group(1) if match else None
    
    return {
        'url': src,
        'embed_url': src,  # Sudah embed URL dari iframe
        'video_id': video_id,
        'platform': platform,
        'watch_url': f"https://www.youtube.com/watch?v={video_id}" if platform == 'youtube' and video_id else None
    }

def extract_episode_sources(episode_data: str) -> Dict[str, Any]:
    """
    Parse base64 JSON dari atribut data pada <li class="select-eps">.
    
    Returns:
        Dict dengan keys:
        - 'videos': dict {resolusi: url}
        - 'default': resolusi default terpilih
        - 'raw': data mentah untuk debugging
    """
    result = {'videos': {}, 'default': None, 'raw': None}
    
    if not episode_data:
        return result
    
    try:
        # Decode base64
        decoded = base64.b64decode(episode_data).decode('utf-8')
        sources = json.loads(decoded)
        result['raw'] = sources
        
        if not isinstance(sources, list):
            logger.warning(f"Unexpected JSON structure: {type(sources)}")
            return result
        
        for src in sources:
            if not isinstance(src, dict):
                continue
                
            res = src.get('format', '').lower().strip()  # "360p", "480p", dll
            urls = src.get('url', [])
            
            if not urls or not isinstance(urls, list) or not urls[0]:
                continue
            
            url = urls[0].strip()
                        
            # Validasi URL
            if validate_video_url(url):
                # Normalisasi resolusi key
                if res and res not in result['videos']:
                    result['videos'][res] = url
                    logger.debug(f"✓ Added {res}: {url[:70]}...")
                elif not res:
                    # Jika tidak ada format, coba tebak dari URL
                    guessed = guess_quality(url)
                    if guessed and guessed not in result['videos']:
                        result['videos'][guessed] = url
                        logger.debug(f"✓ Added {guessed} (guessed): {url[:70]}...")
            else:
                logger.debug(f"✗ Rejected URL: {url[:70]}...")
                
    except base64.binascii.Error as e:
        logger.warning(f"Base64 decode error: {e} | Data: {episode_data[:100]}...")
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e} | Decoded: {episode_data[:100] if len(episode_data) < 200 else '...'}")
    except Exception as e:
        logger.warning(f"Unexpected error parsing episode sources: {e}")
    
    # Tentukan default resolution dengan prioritas
    if result['videos']:
        priority = ['1080p', '720p', '480p', '360p', '240p', '4k', 'fhd', 'hd', 'sd']
        for q in priority:
            if q in result['videos']:
                result['default'] = q
                break
        # Fallback: ambil key pertama
        if not result['default']:
            result['default'] = next(iter(result['videos']))
    
    return result

def extract_episodes(soup: BeautifulSoup, page_url: str) -> List[Dict[str, Any]]:
    """
    Ambil daftar episode dari halaman detail anime.
    
    Returns:
        List of episode dicts dengan keys: number, sources, default, trailer_hint
    """
    episodes = []
    eps_container = soup.find('div', class_='list_eps_stream')
    
    if not eps_container:
        logger.warning(f"Tidak menemukan container episode (.list_eps_stream) di {page_url}")
        return episodes

    for li in eps_container.find_all('li', class_='select-eps'):
        eps_data = li.get('data', '').strip()
        if not eps_data:
            continue
        
        # Ekstrak nomor episode dari teks
        text = li.get_text(strip=True)
        match = re.search(r'Episode\s*(\d+)', text, re.IGNORECASE)
        if not match:
            # Fallback: cari angka apa saja
            match = re.search(r'(\d+)', text)
        
        if not match:
            logger.debug(f"Could not extract episode number from: '{text}'")
            continue
        
        number = int(match.group(1))
        
        # Parse sources
        sources_result = extract_episode_sources(eps_data)
        
        if not sources_result['videos']:
            logger.debug(f"Episode {number}: No valid video sources found")
            continue
        
        episodes.append({
            "number": number,
            "url": page_url,  # Nimegami: semua episode di halaman yang sama
            "sources": sources_result['videos'],
            "default": sources_result['default'],
            "title": f"Episode {number}",
        })
        
        logger.debug(f"✓ Episode {number}: {len(sources_result['videos'])} qualities available")

    # Sort by episode number
    episodes.sort(key=lambda x: x['number'])
    
    if episodes:
        logger.info(f"Found {len(episodes)} episodes (range: {episodes[0]['number']}-{episodes[-1]['number']})")
    else:
        logger.info("No episodes found with valid video sources")
    
    return episodes


def extract_episode_media_from_page(page_url: str, episode_number: Optional[int] = None) -> Dict[str, Any]:
    """
    Ambil media episode tertentu langsung dari halaman detail anime.

    Args:
        page_url: URL halaman anime/detail.
        episode_number: Nomor episode yang dicari. Jika None, pakai episode pertama.

    Returns:
        Dict dengan keys:
        - videos: dict kualitas -> URL
        - streams: dict kualitas -> URL embed/stream
        - default: kualitas default
        - number: nomor episode yang terpilih
    """
    result = {'videos': {}, 'streams': {}, 'default': None, 'number': None}
    if not page_url:
        return result

    soup = get_soup(page_url)
    if not soup:
        return result

    episodes = extract_episodes(soup, page_url)
    if not episodes:
        return result

    selected = None
    if episode_number is not None:
        selected = next((ep for ep in episodes if ep.get('number') == episode_number), None)

    if not selected:
        selected = episodes[0]

    if not selected:
        return result

    result['videos'] = selected.get('sources', {}) or {}
    result['streams'] = selected.get('streams', {}) or {}
    result['default'] = selected.get('default')
    result['number'] = selected.get('number')
    return result

def scrape_anime_detail(url: str) -> Optional[Dict[str, Any]]:
    """
    Scraping detail anime dari URL halaman detail.
    
    Returns:
        Dict dengan semua informasi anime atau None jika gagal
    """
    logger.info(f"Scraping detail: {url}")
    soup = get_soup(url)
    
    if not soup:
        return None

    # ===== TITLE =====
    title_elem = soup.find('h1', class_='title')
    title = clean(title_elem.text) if title_elem else url.split('/')[-1].replace('-', ' ').title()
    # Hapus suffix seperti " : Episode 1 - 12 (End)"
    title = re.sub(r'\s*:?\s*Episode.*$', '', title, flags=re.IGNORECASE).strip()
    title = re.sub(r'\s*\([^)]*Complete[^)]*\)$', '', title, flags=re.IGNORECASE).strip()
    
    slug = url.rstrip('/').split('/')[-1]

    # ===== IMAGE =====
    image = ''
    thumbnail_div = soup.find('div', class_='thumbnail')
    if thumbnail_div:
        img_tag = thumbnail_div.find('img')
        if img_tag and img_tag.get('src'):
            image = img_tag['src'].strip()
            if image.startswith('/'):
                image = urljoin(BASE_URL, image)
            # Validasi: jangan simpan jika ternyata video
            if looks_like_direct_video_url(image):
                image = ''
    
    # ===== SYNOPSIS =====
    synopsis = ''
    sinopsis_div = soup.find('div', id='Sinopsis')
    if sinopsis_div:
        # Ambil semua paragraf dalam sinopsis
        paragraphs = sinopsis_div.find_all('p')
        if paragraphs:
            synopsis = ' '.join(clean(p.get_text()) for p in paragraphs if p.get_text().strip())
    
    # ===== INFO TABLE =====
    info = {
        'studio': '', 'release_date': '', 'status': 'Unknown', 
        'genre': [], 'type': '', 'score': '', 'duration': '',
        'alternative_title': ''
    }
    
    info_table = soup.find('div', class_='info2')
    if info_table:
        rows = info_table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            
            label = clean(cells[0].get_text()).rstrip(':').lower()
            value = clean(cells[1].get_text())
            
            if 'studio' in label:
                # Ambil nama studio pertama jika ada koma
                info['studio'] = value.split(',')[0].strip()
            elif any(kw in label for kw in ['musim', 'rilis', 'season', 'aired']):
                info['release_date'] = value
            elif 'rating' in label or 'score' in label:
                # Ekstrak angka rating
                match = re.search(r'(\d+\.?\d*)', value)
                if match:
                    info['score'] = match.group(1)
            elif any(kw in label for kw in ['durasi', 'duration', 'episode']):
                info['duration'] = value
            elif any(kw in label for kw in ['kategori', 'genre', 'genres']):
                # Parse genre yang dipisah koma
                genres = [g.strip() for g in value.split(',') if g.strip()]
                info['genre'] = genres
            elif 'type' in label:
                info['type'] = value
            elif any(kw in label for kw in ['judul alternatif', 'alternative', 'japanese']):
                info['alternative_title'] = value

    # ===== TRAILER =====
    trailer = extract_trailer(soup)
    
    # ===== EPISODES =====
    episodes = extract_episodes(soup, url)

    # ===== BUILD RESULT =====
    return {
        "title": title,
        "slug": slug,
        "url": url,
        "image": image,
        "synopsis": synopsis,
        "studio": info['studio'],
        "release_date": info['release_date'],
        "status": '',  # Akan diisi dari list page
        "genre": info['genre'],
        "type": info['type'],
        "score": float(info['score']) if info['score'] else None,
        "duration": info['duration'],
        "alternative_title": info['alternative_title'],
        "japanese_title": info['alternative_title'] or title,
        "title_lower": title.lower(),
        "trailer": trailer,
        "episodes": episodes,
        "episode_count": len(episodes),
        "has_streaming": len(episodes) > 0,
        "last_scraped": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat(),
        # Metadata untuk debugging
        "_debug": {
            "trailer_found": trailer is not None,
            "episodes_found": len(episodes),
        }
    }

def get_all_anime_links() -> List[str]:
    """
    Ambil semua link anime dari halaman daftar streaming dengan pagination.
    
    Returns:
        List of anime detail URLs
    """
    all_links = []
    page_url = f"{BASE_URL}/anime-list-streaming/"
    page_count = 0
    
    while page_url and page_count < 50:  # Safety limit
        page_count += 1
        logger.info(f"[Page {page_count}] Mengambil daftar dari {page_url}")
        
        soup = get_soup(page_url)
        if not soup:
            logger.error(f"Gagal mengambil halaman {page_url}")
            break
        
        # Cari container daftar anime
        animelist_div = soup.find('div', class_='animelist')
        if animelist_div:
            for li in animelist_div.find_all('li'):
                a_tag = li.find('a')
                if a_tag and a_tag.get('href'):
                    href = urljoin(BASE_URL, a_tag['href'])
                    # Normalisasi URL
                    href = href.rstrip('/')
                    if href not in all_links:
                        all_links.append(href)
        
        # Cari link next page
        next_link = soup.find('a', class_='next page-numbers')
        if next_link and next_link.get('href'):
            page_url = urljoin(BASE_URL, next_link['href']).rstrip('/')
            # Hindari infinite loop
            if page_url in [f"{BASE_URL}/anime-list-streaming/page/{i}/" for i in range(1, page_count + 1)]:
                break
        else:
            page_url = None
        
        # Rate limiting
        time.sleep(random.uniform(1, 2))
    
    # Hapus duplikat (preserve order)
    seen = set()
    unique_links = []
    for link in all_links:
        if link not in seen:
            seen.add(link)
            unique_links.append(link)
    
    logger.info(f"✓ Ditemukan {len(unique_links)} anime unik dari {page_count} halaman")
    return unique_links

def extract_status_from_list_page() -> Dict[str, str]:
    """
    Ekstrak status (Complete/Ongoing) dari halaman list.
    
    Returns:
        Dict {url: status}
    """
    status_map = {}
    page_url = f"{BASE_URL}/anime-list-streaming/"
    page_count = 0
    
    while page_url and page_count < 50:
        page_count += 1
        soup = get_soup(page_url)
        if not soup:
            break
        
        animelist_div = soup.find('div', class_='animelist')
        if animelist_div:
            for li in animelist_div.find_all('li'):
                a_tag = li.find('a')
                if not a_tag or not a_tag.get('href'):
                    continue
                
                href = urljoin(BASE_URL, a_tag['href']).rstrip('/')
                title_text = a_tag.get_text(strip=True)
                
                # Ekstrak status dari teks "(Complete)" atau "(On-Going)"
                match = re.search(r'\(([^)]+)\)', title_text)
                if match:
                    status_raw = match.group(1).strip().lower()
                    if 'complete' in status_raw or 'finished' in status_raw:
                        status = 'Completed'
                    elif 'ongoing' in status_raw or 'on-going' in status_raw:
                        status = 'Ongoing'
                    elif 'upcoming' in status_raw:
                        status = 'Upcoming'
                    else:
                        status = status_raw.title()
                else:
                    status = 'Unknown'
                
                status_map[href] = status
        
        # Next page
        next_link = soup.find('a', class_='next page-numbers')
        if next_link and next_link.get('href'):
            page_url = urljoin(BASE_URL, next_link['href']).rstrip('/')
        else:
            page_url = None
        
        time.sleep(random.uniform(0.5, 1.5))
    
    logger.info(f"✓ Status map: {len(status_map)} entries")
    return status_map

def load_existing_db() -> Dict[str, Dict]:
    """Load database existing dari file JSON."""
    if not os.path.exists(DB_PATH):
        return {}
    
    try:
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if isinstance(data, dict) and 'data' in data:
            anime_list = data['data']
        elif isinstance(data, list):
            anime_list = data
        else:
            logger.warning(f"Unexpected JSON structure in {DB_PATH}")
            return {}
        
        # Convert to dict keyed by slug
        return {a['slug']: a for a in anime_list if isinstance(a, dict) and 'slug' in a}
    
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return {}
    except Exception as e:
        logger.error(f"Error loading existing DB: {e}")
        return {}

def is_data_valid(data: List[Dict], min_total: int = EXPECTED_MIN_ANIME, 
                  min_episode_ratio: float = EXPECTED_MIN_WITH_EPISODES_RATIO) -> bool:
    """Validasi kualitas data sebelum save."""
    if len(data) < min_total:
        logger.error(f"❌ Data terlalu sedikit: {len(data)} < {min_total}")
        return False
    
    # Hitung anime yang minimal punya trailer ATAU episode
    valid = [a for a in data if a.get('has_streaming') or a.get('trailer')]
    ratio = len(valid) / len(data) if data else 0
    
    if ratio < min_episode_ratio:
        logger.error(f"❌ Rasio anime dengan konten terlalu rendah: {ratio:.2%} < {min_episode_ratio:.2%}")
        logger.error(f"   Valid: {len(valid)}/{len(data)} (punya streaming atau trailer)")
        return False
    
    logger.info(f"✓ Data valid: {len(data)} anime, {len(valid)} dengan konten ({ratio:.2%})")
    return True

def safe_save(data: List[Dict], final_path: str):
    """Save data dengan atomic write untuk mencegah corrupt."""
    # Deduplicate by slug
    unique = {}
    for anime in data:
        slug = anime.get('slug')
        if slug:
            unique[slug] = anime
    
    data = list(unique.values())
    data.sort(key=lambda x: x.get('title_lower', ''))
    
    # Prepare output
    output = {
        "meta": {
            "source": "nimegami.id",
            "scraped_at": datetime.now().isoformat(),
            "total_anime": len(data),
            "with_streaming": sum(1 for a in data if a.get('has_streaming')),
            "with_trailer": sum(1 for a in data if a.get('trailer')),
        },
        "data": data
    }
    
    # Atomic write: write to temp file first, then rename
    temp_path = final_path + ".tmp"
    try:
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        # Backup existing if exists
        if os.path.exists(final_path):
            backup_path = final_path + ".backup"
            shutil.copy2(final_path, backup_path)
            logger.info(f"✓ Backup dibuat: {backup_path}")
        
        # Atomic rename
        os.replace(temp_path, final_path)
        logger.info(f"✓ Data saved: {final_path} ({len(data)} anime)")
        
    except Exception as e:
        logger.error(f"❌ Error saving data: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise

def save_total_count(count: int):
    """Save total count untuk deteksi drop."""
    try:
        with open(COUNT_FILE, 'w') as f:
            f.write(str(count))
    except Exception as e:
        logger.warning(f"Could not save count file: {e}")

def load_last_total() -> Optional[int]:
    """Load last total count."""
    if not os.path.exists(COUNT_FILE):
        return None
    try:
        with open(COUNT_FILE, 'r') as f:
            return int(f.read().strip())
    except:
        return None

def generate_no_streaming_message(anime_title: str) -> str:
    """Generate pesan untuk anime tanpa streaming."""
    return f"Maaf, untuk saat ini belum tersedia streaming untuk **{anime_title}**. Streaming akan diupdate secepatnya. Silakan cek kembali nanti atau gunakan fitur download jika tersedia."

def main():
    parser = argparse.ArgumentParser(description="Nimegami Anime Scraper")
    parser.add_argument('--mode', choices=['full', 'update'], default='full',
                        help='Mode scraping: full (semua) atau update (hanya baru/ubah)')
    parser.add_argument('--min-data', type=int, default=EXPECTED_MIN_ANIME,
                        help='Minimal jumlah anime yang dianggap valid')
    parser.add_argument('--check-drop', action='store_true',
                        help='Cek penurunan drastis jumlah anime dari sebelumnya')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    parser.add_argument('--limit', type=int, default=None, help='Limit jumlah anime untuk testing')
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info(f"🚀 === MULAI SCRAPING NIMEGAMI ===")
    logger.info(f"Mode: {args.mode} | Base URL: {BASE_URL}")
    
    # Backup existing DB
    if os.path.exists(DB_PATH):
        backup_path = DB_PATH + ".pre-scrape"
        shutil.copy2(DB_PATH, backup_path)
        logger.info(f"✓ Backup DB: {backup_path}")
    
    # Step 1: Get all anime links
    logger.info("📋 Mengambil daftar anime...")
    all_anime_links = get_all_anime_links()
    
    if args.limit:
        all_anime_links = all_anime_links[:args.limit]
        logger.info(f"⚠️ Limited to {args.limit} anime for testing")
    
    if not all_anime_links:
        logger.error("❌ Tidak ada anime yang ditemukan. Periksa koneksi atau struktur website.")
        return
    
    # Step 2: Get status map from list page
    logger.info("📊 Mengambil status anime...")
    status_map = extract_status_from_list_page()
    
    # Step 3: Scrape details
    db = []
    
    if args.mode == 'full':
        logger.info(f"🔄 Full scrape: {len(all_anime_links)} anime")
        
        for idx, url in enumerate(all_anime_links, 1):
            logger.info(f"[{idx:4d}/{len(all_anime_links)}] {url.split('/')[-1]}")
            
            data = scrape_anime_detail(url)
            if data:
                # Add status from list page
                data['status'] = status_map.get(url, data['status'] or 'Unknown')
                db.append(data)
            
            # Rate limiting
            time.sleep(random.uniform(0.8, 2.0))
    
    else:  # update mode
        logger.info("🔄 Update mode: checking existing DB...")
        existing = load_existing_db()
        existing_slugs = set(existing.keys())
        db = list(existing.values())
        
        # Find new anime
        new_links = [url for url in all_anime_links 
                     if url.rstrip('/').split('/')[-1] not in existing_slugs]
        
        logger.info(f"🆕 {len(new_links)} anime baru ditemukan")
        
        # Scrape new anime
        for url in new_links:
            slug = url.rstrip('/').split('/')[-1]
            logger.info(f"[NEW] {slug}")
            
            data = scrape_anime_detail(url)
            if data:
                data['status'] = status_map.get(url, data['status'] or 'Unknown')
                db.append(data)
            
            time.sleep(random.uniform(0.8, 2.0))
        
        # Update existing anime (check for new episodes)
        logger.info("🔍 Checking existing anime for updates...")
        for url in all_anime_links:
            slug = url.rstrip('/').split('/')[-1]
            if slug not in existing_slugs:
                continue
            
            anime = existing[slug].copy()  # Don't modify original
            logger.debug(f"[CHECK] {slug}")
            
            # Update status
            anime['status'] = status_map.get(url, anime['status'])
            
            # Re-scrape to check for new episodes
            soup = get_soup(url)
            if not soup:
                continue
            
            new_eps = extract_episodes(soup, url)
            old_ep_numbers = {ep['number'] for ep in anime.get('episodes', [])}
            
            added = 0
            for ep in new_eps:
                if ep['number'] not in old_ep_numbers:
                    anime['episodes'].append(ep)
                    added += 1
            
            if added > 0:
                anime['episodes'].sort(key=lambda x: x['number'])
                anime['episode_count'] = len(anime['episodes'])
                anime['has_streaming'] = len(anime['episodes']) > 0
                anime['last_updated'] = datetime.now().isoformat()
                logger.info(f"  ➕ {added} episode baru: {slug}")
            
            # Update in db list
            for i, item in enumerate(db):
                if item.get('slug') == slug:
                    db[i] = anime
                    break
            
            time.sleep(random.uniform(0.3, 1.0))
    
    # Step 4: Add "no streaming" message for anime without episodes
    logger.info("📝 Adding no-streaming messages...")
    for anime in db:
        if not anime.get('has_streaming') and anime.get('trailer'):
            # Anime punya trailer tapi no streaming
            anime['no_streaming_message'] = generate_no_streaming_message(anime['title'])
            anime['has_trailer_only'] = True
            logger.debug(f"  🎬 Trailer-only: {anime['title']}")
    
    # Step 5: Validate data
    if not is_data_valid(db, args.min_data):
        logger.error("❌ Data validation failed. Aborting save.")
        return
    
    # Step 6: Check for drastic drop
    if args.check_drop:
        last_total = load_last_total()
        if last_total is not None:
            current_total = len(db)
            drop_threshold = 0.8  # 20% drop is suspicious
            
            if current_total < last_total * drop_threshold:
                logger.error(f"❌ Drastic drop detected: {last_total} → {current_total} ({(current_total/last_total*100):.1f}%)")
                logger.error("Aborting save to prevent data loss.")
                return
            else:
                logger.info(f"✓ Count check: {last_total} → {current_total} (OK)")
    
    # Step 7: Save
    logger.info("💾 Saving data...")
    safe_save(db, DB_PATH)
    save_total_count(len(db))
    
    # Summary
    with_streaming = sum(1 for a in db if a.get('has_streaming'))
    with_trailer = sum(1 for a in db if a.get('trailer'))
    trailer_only = sum(1 for a in db if a.get('has_trailer_only'))
    logger.info(f"""
🎉 === SCRAPING COMPLETE ===
📦 Total anime: {len(db)}
🎬 With streaming: {with_streaming}
🎥 With trailer: {with_trailer}
🎬 Trailer-only (no streaming): {trailer_only}
📁 Saved to: {DB_PATH}
📊 Log file: {os.path.join(LOG_DIR, 'nimegami_scraper.log')}
    """)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("⚠️ Interrupted by user")
    except Exception as e:
        logger.exception(f"❌ Fatal error: {e}")
        raise

import requests
from bs4 import BeautifulSoup
import json
import re
import time
import os
import random
import shutil
import argparse
import logging
from datetime import datetime

BASE_URL = "https://coba.oploverz.ltd"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    filename="logs/scraper.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    encoding="utf-8"
)
console = logging.StreamHandler()
console.setLevel(logging.INFO)
logging.getLogger().addHandler(console)

COUNT_FILE = "logs/last_total.txt"
EXPECTED_MIN = 500

def clean(text):
    return ' '.join(text.strip().split()) if text else ''

def get_soup(url, retries=3):
    for i in range(retries):
        try:
            res = requests.get(url, headers=HEADERS, timeout=15)
            res.encoding = 'utf-8'
            return BeautifulSoup(res.text, 'html.parser')
        except Exception as e:
            logging.warning(f"Request gagal ({i+1}/{retries}): {e}")
            if i < retries - 1:
                time.sleep(2 ** i)
    return None

def is_video_url(url):
    return bool(re.search(r'\.(mp4|m3u8)', url, re.IGNORECASE))

def extract_episode_sources(episode_url):
    """Fungsi ini akan dipanggil oleh API, bukan saat scraping"""
    sources = {}
    soup = get_soup(episode_url)
    if not soup:
        return None

    download_links = soup.select('.download-eps a, .download-links a, a[href*=".mp4"], a[href*=".m3u8"]')
    
    for link in download_links:
        text = link.text.lower()
        href = link.get('href', '')
        if not href:
            continue
        if not is_video_url(href):
            continue
        if '360' in text:
            sources['360p'] = href
        elif '480' in text:
            sources['480p'] = href
        elif '720' in text:
            sources['720p'] = href
        elif '1080' in text:
            sources['1080p'] = href
        elif '240' in text:
            sources['240p'] = href

    return sources if sources else None

def extract_episodes(soup):
    episodes = []
    containers = soup.select('.episodelist ul li, .list-episode li, .eplister li')
    if not containers:
        containers = soup.find_all('a', href=True)
    
    seen = set()
    for elem in containers:
        if elem.name == 'a':
            link = elem
        else:
            link = elem.find('a')
            if not link:
                continue
        href = link.get('href', '')
        if '/episode/' not in href:
            continue
        text = link.get_text()
        match = re.search(r'(\d+)', text)
        if not match:
            continue
        num = int(match.group(1))
        if num in seen:
            continue
        seen.add(num)
        if not href.startswith('http'):
            href = BASE_URL + href if href.startswith('/') else href

        # Jangan ambil sumber video di sini, biarkan API yang mengambil
        episodes.append({
            "number": num,
            "url": href,
            "sources": {},          # akan diisi oleh API
            "default": '360p'        # sementara
        })
        time.sleep(random.uniform(0.5, 1))

    episodes.sort(key=lambda x: x['number'])
    return episodes

def scrape_anime_detail(url):
    logging.info(f"Scraping detail: {url}")
    soup = get_soup(url)
    if not soup:
        return None

    title_elem = soup.find('h1')
    title = clean(title_elem.text) if title_elem else url.split('/')[-1].replace('-', ' ').title()
    title = title.split('|')[0].strip()
    
    slug = url.rstrip('/').split('/')[-1]

    img = soup.select_one('.anime-poster img, .poster img, .thumb img')
    if not img:
        img = soup.find('img')
    image = img.get('src', '') if img else ''
    if image and image.startswith('/'):
        image = BASE_URL + image

    synopsis = ''
    for p in soup.find_all('p'):
        text = clean(p.text)
        if len(text) > 100 and 'Tipe:' not in text and 'Status:' not in text:
            synopsis = text
            break

    full_text = soup.get_text(separator="\n")
    info = {'studio': '', 'release_date': '', 'status': 'Unknown', 'genre': []}
    for line in full_text.split('\n'):
        line = line.strip()
        if 'Studio:' in line:
            info['studio'] = line.replace('Studio:', '').strip()
        elif 'Tanggal Rilis:' in line:
            info['release_date'] = line.replace('Tanggal Rilis:', '').strip()
        elif 'Status:' in line:
            status_raw = line.replace('Status:', '').strip()
            if 'ongoing' in status_raw.lower() or 'on going' in status_raw.lower():
                info['status'] = 'Ongoing'
            elif 'completed' in status_raw.lower():
                info['status'] = 'Completed'
            else:
                info['status'] = status_raw
        elif 'Genre:' in line:
            genre_text = line.replace('Genre:', '').strip()
            info['genre'] = [g.strip() for g in genre_text.split(',') if g.strip()]

    episodes = extract_episodes(soup)

    if not episodes:
        logging.warning(f"Anime {title} tidak memiliki episode, tetap disimpan")

    return {
        "title": title,
        "slug": slug,
        "image": image,
        "synopsis": synopsis,
        "studio": info['studio'],
        "release_date": info['release_date'],
        "status": info['status'],
        "genre": info['genre'],
        "title_lower": title.lower(),
        "episodes": episodes,
        "last_updated": datetime.now().isoformat()
    }

def get_all_anime_links():
    """Ambil semua link anime dari halaman utama /series"""
    url = f"{BASE_URL}/series"
    logging.info(f"Mengambil daftar anime dari {url}")
    soup = get_soup(url)
    if not soup:
        return []

    links = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '/series/' in href and not '/episode/' in href:
            if href.startswith('/'):
                href = BASE_URL + href
            links.add(href.rstrip('/'))

    logging.info(f"Ditemukan {len(links)} anime unik")
    return list(links)

def load_existing_db():
    path = 'public/data/anime_master.json'
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f).get('data', [])
        return {a['slug']: a for a in data}
    except:
        return {}

def is_data_valid(data, min_total=EXPECTED_MIN, min_episode_ratio=0.5):
    if len(data) < min_total:
        logging.error(f"Data terlalu sedikit: {len(data)} < {min_total}")
        return False
    valid = [a for a in data if len(a.get('episodes', [])) > 0]
    ratio = len(valid) / len(data)
    if ratio < min_episode_ratio:
        logging.error(f"Rasio anime dengan episode terlalu rendah: {ratio:.2f}")
        return False
    return True

def safe_save(data, final_path):
    unique = {}
    for a in data:
        unique[a['slug']] = a
    data = list(unique.values())

    temp_path = final_path + ".tmp"
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump({"timestamp": time.time(), "data": data}, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, final_path)

def save_total_count(count):
    with open(COUNT_FILE, 'w') as f:
        f.write(str(count))

def load_last_total():
    if not os.path.exists(COUNT_FILE):
        return None
    with open(COUNT_FILE, 'r') as f:
        try:
            return int(f.read().strip())
        except:
            return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['full', 'update'], default='full')
    parser.add_argument('--min-data', type=int, default=EXPECTED_MIN, help='Minimal jumlah anime yang dianggap valid')
    parser.add_argument('--check-drop', action='store_true', help='Cek penurunan jumlah anime dari sebelumnya')
    args = parser.parse_args()

    logging.info(f"=== MULAI SCRAPING mode: {args.mode} ===")
    os.makedirs("public/data", exist_ok=True)

    db_path = 'public/data/anime_master.json'
    if os.path.exists(db_path):
        shutil.copy(db_path, 'public/data/anime_master_backup.json')
        logging.info("Backup dibuat")

    all_anime_links = get_all_anime_links()
    logging.info(f"Total anime di website: {len(all_anime_links)}")

    if args.mode == 'full':
        db = []
        for idx, url in enumerate(all_anime_links, 1):
            logging.info(f"[{idx}/{len(all_anime_links)}] {url}")
            data = scrape_anime_detail(url)
            if data:
                db.append(data)
            time.sleep(random.uniform(0.8, 1.5))

    else:  # mode update
        existing = load_existing_db()
        db = list(existing.values())
        existing_slugs = set(existing.keys())
        
        new_links = [url for url in all_anime_links if url.rstrip('/').split('/')[-1] not in existing_slugs]
        
        for url in new_links:
            slug = url.rstrip('/').split('/')[-1]
            logging.info(f"[NEW] {slug}")
            data = scrape_anime_detail(url)
            if data:
                db.append(data)
            time.sleep(random.uniform(0.8, 1.5))

        for url in all_anime_links:
            slug = url.rstrip('/').split('/')[-1]
            if slug not in existing_slugs:
                continue
            anime = existing[slug]
            logging.info(f"[UPDATE] {slug}")
            soup = get_soup(url)
            if not soup:
                continue
            
            new_eps = extract_episodes(soup)
            old_eps_numbers = {ep['number'] for ep in anime.get('episodes', [])}
            added = 0
            for ep in new_eps:
                if ep['number'] not in old_eps_numbers:
                    anime['episodes'].append(ep)
                    added += 1
            if added > 0:
                anime['episodes'].sort(key=lambda x: x['number'])
                anime['last_updated'] = datetime.now().isoformat()
                logging.info(f"➕ {added} episode baru ditambahkan")
            
            full_text = soup.get_text(separator="\n")
            for line in full_text.split('\n'):
                line = line.strip()
                if 'Status:' in line:
                    status_raw = line.replace('Status:', '').strip()
                    if 'ongoing' in status_raw.lower() or 'on going' in status_raw.lower():
                        anime['status'] = 'Ongoing'
                    elif 'completed' in status_raw.lower():
                        anime['status'] = 'Completed'
                    break
            
            time.sleep(random.uniform(0.5, 1))

    if not is_data_valid(db, args.min_data):
        logging.error("Data tidak valid. Proses dibatalkan.")
        exit(1)

    if args.check_drop:
        last_total = load_last_total()
        if last_total is not None:
            current_total = len(db)
            if current_total < last_total * 0.8:
                logging.error(f"Jumlah anime turun drastis: {last_total} → {current_total}. Proses dibatalkan.")
                exit(1)
            else:
                logging.info(f"Jumlah anime: {last_total} → {current_total} (OK)")

    safe_save(db, db_path)
    save_total_count(len(db))
    logging.info(f"Selesai! {len(db)} anime tersimpan di {db_path}")

if __name__ == "__main__":
    main()
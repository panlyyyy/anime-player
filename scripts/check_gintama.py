import requests
from bs4 import BeautifulSoup
import re

url = 'https://coba.oploverz.ltd/series/gintama-s5-gintama'
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
soup = BeautifulSoup(r.text, 'html.parser')

# Episode links
links = soup.select('a[href*="/episode/"]')
nums = set()
for a in links:
    m = re.search(r'/episode/(\d+)', a.get('href', ''))
    if m:
        nums.add(int(m.group(1)))
print('Episodes found:', len(nums), 'Range:', min(nums) if nums else 0, '-', max(nums) if nums else 0)

# Genre from LI
for li in soup.select('li'):
    t = li.get_text(strip=True)
    if 'Genre' in t:
        print('LI text:', repr(t[:80]))
        g = re.sub(r'^Genre:?\s*', '', t, flags=re.I)
        g = re.split(r'\s+Skor:|\s+Durasi:', g)[0]
        genres = [x.strip() for x in g.split(',') if x.strip()]
        print('Parsed genres:', genres)

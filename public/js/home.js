let allAnime = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();

    window.addEventListener('scroll', () => {
        const header = document.getElementById('mainHeader');
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
});

async function loadData() {
    UI.showLoading(true);
    try {
        const res = await API.getAnimeList(1, 50);
        if (!res.success) throw new Error('Gagal memuat data');

        allAnime = res.data;

        if (allAnime.length > 0) {
            renderFeatured(allAnime[0]);
        }

        renderGenrePills();
        renderContinueWatching();
        renderRecommendations();

    } catch (err) {
        console.error(err);
        UI.showNotification('Gagal memuat data', 3000, 'error');
    } finally {
        UI.showLoading(false);
    }
}

function renderFeatured(anime) {
    const featured = document.querySelector('.featured');
    if (!featured) return;

    featured.innerHTML = `
        <img src="${anime.image || 'https://images.unsplash.com/photo-1541562232579-512a21360020'}" class="featured-img" data-slug="${anime.slug}" alt="${anime.title.replace(/"/g, '&quot;')}">
        <div class="featured-content">
            <h1 class="hero-title" style="font-size: 42px; font-weight: 900; margin-bottom: 5px;">${anime.title.replace(/"/g, '&quot;')}</h1>
            <div class="tags">
                ${anime.genre?.slice(0, 3).map(g => `<span class="tag">${g.replace(/"/g, '&quot;')}</span>`).join('')}
                <span class="tag">Eps ${anime.episodes?.length || '?'}</span>
            </div>
            <div class="action-group">
                <button class="btn btn-primary watch-btn" data-slug="${anime.slug}"><i class="fas fa-play"></i> Tonton Sekarang</button>
                <button class="btn btn-secondary fav-btn" data-slug="${anime.slug}"><i class="fas fa-plus"></i> Daftar Saya</button>
            </div>
        </div>
    `;

    featured.querySelector('.watch-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = e.currentTarget.dataset.slug;
        const anime = allAnime.find(a => a.slug === slug);
        if (anime) openPlayer(anime);
    });

    featured.querySelector('.fav-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = e.currentTarget.dataset.slug;
        toggleFavorite(slug);
    });
}

function renderGenrePills() {
    const genres = new Set();
    allAnime.forEach(a => a.genre?.forEach(g => genres.add(g)));
    const genreList = ['Semua', ...Array.from(genres).sort()];

    const container = document.querySelector('.category-scroll');
    if (!container) return;

    container.innerHTML = genreList.map(g =>
        `<div class="pill ${g === 'Semua' ? 'active' : ''}" data-genre="${g.replace(/"/g, '&quot;')}">${g.replace(/"/g, '&quot;')}</div>`
    ).join('');

    container.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
        });
    });
}

function renderContinueWatching() {
    const history = Storage.getHistory();
    if (history.length === 0) {
        document.getElementById('continueSection')?.remove();
        return;
    }

    const continueAnime = history.slice(0, 5);
    const container = document.getElementById('continueList');
    if (!container) return;

    container.innerHTML = continueAnime.map(anime => UI.renderHorizontalCard(anime, 'continue')).join('');

    container.querySelectorAll('.anime-card-wide').forEach(card => {
        card.addEventListener('click', () => {
            const slug = card.dataset.slug;
            const anime = allAnime.find(a => a.slug === slug);
            if (anime) openPlayer(anime);
        });
    });
}

function renderRecommendations() {
    const shuffled = [...allAnime].sort(() => 0.5 - Math.random());
    const recommendations = shuffled.slice(0, 10);

    const container = document.getElementById('recommendList');
    if (!container) return;

    container.innerHTML = recommendations.map(anime => UI.renderHorizontalCard(anime, 'recommend')).join('');

    container.querySelectorAll('.anime-card-wide').forEach(card => {
        card.addEventListener('click', () => {
            const slug = card.dataset.slug;
            const anime = allAnime.find(a => a.slug === slug);
            if (anime) openPlayer(anime);
        });
    });
}

function setupEventListeners() {
    const seeAllContinue = document.querySelector('#continueSection h2 span');
    if (seeAllContinue) {
        seeAllContinue.addEventListener('click', () => {
            window.location.href = '/history.html';
        });
    }

    const seeAllRec = document.querySelector('#recommendSection h2 span');
    if (seeAllRec) {
        seeAllRec.addEventListener('click', () => {
            window.location.href = '/search.html';
        });
    }
}

window.toggleFavorite = function(slug) {
    const anime = allAnime.find(a => a.slug === slug);
    if (!anime) return;
    const isNowFavorite = Storage.toggleFavorite(anime);
    UI.showNotification(isNowFavorite ? '❤️ Ditambahkan ke Favorit' : '💔 Dihapus dari Favorit', 2000, 'success');
};
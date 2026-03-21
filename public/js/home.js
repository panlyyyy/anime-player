let allAnime = [];
let heroCarouselTimer = null;
let heroCandidates = [];

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

        startHeroCarousel();

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

function startHeroCarousel() {
    if (heroCarouselTimer) {
        clearInterval(heroCarouselTimer);
        heroCarouselTimer = null;
    }
    heroCandidates = allAnime.slice(0, Math.min(5, allAnime.length));
    if (heroCandidates.length === 0) return;
    let idx = 0;
    renderFeatured(heroCandidates[idx]);
    if (heroCandidates.length <= 1) return;
    heroCarouselTimer = setInterval(() => {
        idx = (idx + 1) % heroCandidates.length;
        renderFeatured(heroCandidates[idx]);
    }, 6500);
}

function renderFeatured(anime) {
    const featured = document.querySelector('.featured');
    if (!featured || !anime) return;

    const dots = heroCandidates.length > 1
        ? `<div class="hero-dots">${heroCandidates.map((a) =>
            `<button type="button" class="hero-dot ${a.slug === anime.slug ? 'active' : ''}" data-slug="${a.slug}" aria-label="Hero ${a.title.replace(/"/g, '')}"></button>`
        ).join('')}</div>`
        : '';

    featured.innerHTML = `
        <img src="${anime.image || 'https://images.unsplash.com/photo-1541562232579-512a21360020'}" class="featured-img" data-slug="${anime.slug}" alt="${anime.title.replace(/"/g, '&quot;')}">
        <div class="featured-gradient"></div>
        <div class="featured-content">
            <h1 class="hero-title">${anime.title.replace(/"/g, '&quot;')}</h1>
            <div class="tags">
                ${anime.genre?.slice(0, 3).map(g => `<span class="tag">${g.replace(/"/g, '&quot;')}</span>`).join('') || '<span class="tag">Anime</span>'}
                <span class="tag">Eps ${anime.episodes?.length || '?'}</span>
            </div>
            <div class="action-group">
                <button class="btn btn-primary watch-btn" data-slug="${anime.slug}"><i class="fas fa-play"></i> Tonton</button>
                <button class="btn btn-secondary fav-btn" data-slug="${anime.slug}"><i class="fas fa-plus"></i> Daftar Saya</button>
            </div>
        </div>
        ${dots}
    `;

    featured.querySelector('.watch-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = e.currentTarget.dataset.slug;
        const a = allAnime.find((x) => x.slug === slug) || heroCandidates.find((x) => x.slug === slug);
        if (a) openPlayer(a);
    });

    featured.querySelector('.fav-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = e.currentTarget.dataset.slug;
        toggleFavorite(slug);
    });

    featured.querySelectorAll('.hero-dot').forEach((dot) => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const slug = dot.dataset.slug;
            const a = heroCandidates.find((x) => x.slug === slug);
            if (a) renderFeatured(a);
        });
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
            const hItem = continueAnime.find((h) => h.slug === slug);
            if (hItem) openContinueFromHistory(hItem);
        });
    });
}

async function openContinueFromHistory(hItem) {
    if (!hItem?.slug) return;
    let anime = allAnime.find((a) => a.slug === hItem.slug);
    if (!anime) {
        UI.showLoading(true);
        try {
            const res = await API.getDetail(hItem.slug);
            if (!res.success) throw new Error('no data');
            anime = res.data;
        } catch (e) {
            UI.showNotification('Gagal memuat anime dari riwayat', 2500, 'error');
            return;
        } finally {
            UI.showLoading(false);
        }
    }
    const ep = Storage.findResumeEpisode(anime, hItem);
    openPlayer(anime, ep);
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
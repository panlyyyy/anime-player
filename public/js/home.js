let allAnime = [];
let heroCarouselTimer = null;
let heroCandidates = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();

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

const FEATURED_HERO_SLUGS = ['jigokuraku-s2', 'jujutsu-kaisen-s3-the-culling-game', 'one-piece', 'gintama-s5-gintama'];

function startHeroCarousel() {
    if (heroCarouselTimer) {
        clearInterval(heroCarouselTimer);
        heroCarouselTimer = null;
    }
    const withEps = allAnime.filter(a => (a.episodes?.length || 0) > 0);
    const byScore = [...withEps].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    // Prioritaskan featured dari DB yang ada di allAnime
    const featured = FEATURED_HERO_SLUGS.map(s => withEps.find(a => a.slug === s)).filter(Boolean);
    heroCandidates = featured.length > 0 ? featured : (byScore.length > 0 ? byScore : allAnime).slice(0, Math.min(5, allAnime.length));
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

    const safe = (s) => String(s ?? '').replace(/</g, '').replace(/"/g, '&quot;');
    const synopsisRaw = anime.synopsis || anime.description || '';
    const synopsis = safe(synopsisRaw);
    const epCount = anime.episodes?.length ?? '?';
    const year = anime.release_date ? (anime.release_date.match(/\d{4}/) || [])[0] : (anime.year || '—');
    const rating = anime.score != null ? anime.score : (anime.rating != null ? anime.rating : '—');
    const genreLine = (anime.genre?.slice(0, 4) || []).map((g) => safe(g)).filter(Boolean).join(' • ');

    featured.innerHTML = `
        <img src="${anime.image || 'https://images.unsplash.com/photo-1541562232579-512a21360020'}" class="featured-img" data-slug="${anime.slug}" alt="${safe(anime.title)}">
        <div class="featured-gradient"></div>
        <div class="featured-content">
            <div class="hero-copy">
                <h1 class="hero-title">${safe(anime.title)}</h1>
                <div class="hero-meta-row">
                    <span class="hero-rating"><i class="fas fa-star"></i> ${safe(rating)}</span>
                    <span class="hero-pill">${safe(year)}</span>
                    <span class="hero-pill">${epCount} EP</span>
                    ${genreLine ? `<span class="hero-genres">${genreLine}</span>` : ''}
                </div>
                <p class="hero-synopsis line-clamp-3 line-clamp-md-none">${synopsis || 'Sinopsis belum tersedia.'}</p>
                <div class="tags">
                    ${anime.genre?.slice(0, 3).map(g => `<span class="tag">${safe(g)}</span>`).join('') || '<span class="tag">Anime</span>'}
                    <span class="tag">Eps ${epCount}</span>
                </div>
                <div class="action-group">
                    <button type="button" class="btn btn-primary watch-btn" data-slug="${anime.slug}"><i class="fas fa-play"></i> Tonton</button>
                    <button type="button" class="btn btn-secondary fav-btn ${Storage.isFavorite(anime.slug) ? 'is-favorite' : ''}" data-slug="${anime.slug}">${
                        Storage.isFavorite(anime.slug)
                            ? '<i class="fas fa-heart"></i> Hapus dari daftar'
                            : '<i class="fas fa-plus"></i> Daftar Saya'
                    }</button>
                </div>
            </div>
        </div>
        ${dots}
    `;

    featured.querySelector('.watch-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const slug = e.currentTarget.dataset.slug;
        // Open detail page instead of player
        window.location.href = `/anime-detail.html?slug=${encodeURIComponent(slug)}`;
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

let currentGenre = 'Semua';

function renderGenrePills() {
    const genres = new Set();
    allAnime.forEach(a => a.genre?.forEach(g => genres.add(g)));
    const genreList = ['Semua', ...Array.from(genres).sort()];

    const container = document.querySelector('.category-scroll');
    if (!container) return;

    container.innerHTML = genreList.map(g =>
        `<div class="pill ${g === currentGenre ? 'active' : ''}" data-genre="${g.replace(/"/g, '&quot;')}">${g.replace(/"/g, '&quot;')}</div>`
    ).join('');

    container.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', () => {
            currentGenre = pill.dataset.genre || 'Semua';
            document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderRecommendations();
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
            // Open detail page instead of player
            window.location.href = `/anime-detail.html?slug=${encodeURIComponent(slug)}`;
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
    let filtered = currentGenre === 'Semua'
        ? allAnime
        : allAnime.filter((a) => (a.genre || []).includes(currentGenre));
    
    // Sort by rating (high to low) and take top 10
    const byScore = [...filtered].sort((a, b) => {
        const scoreA = parseFloat(a.score) || 0;
        const scoreB = parseFloat(b.score) || 0;
        return scoreB - scoreA;
    });
    const recommendations = byScore.slice(0, 10);

    const container = document.getElementById('recommendList');
    if (!container) return;

    if (recommendations.length === 0) {
        container.innerHTML = `<div class="empty" style="padding:24px;color:var(--ns-muted);">Tidak ada anime untuk genre ini</div>`;
        return;
    }
    container.innerHTML = recommendations.map(anime => UI.renderHorizontalCard(anime, 'recommend')).join('');

    container.querySelectorAll('.anime-card-wide').forEach(card => {
        card.addEventListener('click', () => {
            const slug = card.dataset.slug;
            // Open detail page instead of player
            window.location.href = `/anime-detail.html?slug=${encodeURIComponent(slug)}`;
        });
    });
}

function setupEventListeners() {
    document.querySelector('#continueSection .section-more')?.addEventListener('click', () => {
        window.location.href = '/history.html';
    });

    document.querySelector('#recommendSection .section-more')?.addEventListener('click', () => {
        window.location.href = '/search.html';
    });
}

function resolveAnimeForFavorite(slug) {
    return (
        allAnime.find((a) => String(a.slug) === String(slug)) ||
        heroCandidates.find((a) => String(a.slug) === String(slug)) ||
        Storage.getFavorites().find((f) => String(f.slug) === String(slug)) ||
        null
    );
}

window.toggleFavorite = function (slug) {
    const anime = resolveAnimeForFavorite(slug);
    if (!anime) return;
    const isNowFavorite = Storage.toggleFavorite(anime);
    UI.showNotification(
        isNowFavorite ? 'Ditambahkan ke Daftar Saya' : 'Dihapus dari Daftar Saya',
        2000,
        'success'
    );
    UI.applyFavoriteUiState(String(slug));
};
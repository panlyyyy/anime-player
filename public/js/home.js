let allAnime = [];
let heroCarouselTimer = null;
let heroCandidates = [];
const homeShuffleSeed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
});

async function loadData() {
    UI.showLoading(true);
    try {
        const data = await API.loadStaticData();
        allAnime = API.sortAnimeByRanking(data.filter((anime) => API.isDisplayableAnime(anime)));

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

    const withPlayableMedia = allAnime.filter((anime) => API.hasPlayableMedia(anime));
    const source = withPlayableMedia.length > 0 ? withPlayableMedia : allAnime;

    heroCandidates = API.getShuffledDiscoverySelection(source, `${homeShuffleSeed}:hero`, {
        minScore: 7.6,
        minPool: 10,
        maxPool: 24,
        limit: Math.min(5, source.length),
        requirePlayable: withPlayableMedia.length > 0
    });

    if (heroCandidates.length === 0) {
        heroCandidates = API.shuffleAnimeBySeed(
            API.sortAnimeByRanking(source).slice(0, Math.min(5, source.length)),
            `${homeShuffleSeed}:hero:fallback`
        );
    }

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
        ? `<div class="hero-dots">${heroCandidates.map((item) =>
            `<button type="button" class="hero-dot ${item.slug === anime.slug ? 'active' : ''}" data-slug="${item.slug}" aria-label="Hero ${item.title.replace(/"/g, '')}"></button>`
        ).join('')}</div>`
        : '';

    const safe = (value) => String(value ?? '').replace(/</g, '').replace(/"/g, '&quot;');
    const synopsis = safe(anime.synopsis || anime.description || '');
    const episodeCount = anime.episodes?.length ?? '?';
    const year = anime.release_date ? (anime.release_date.match(/\d{4}/) || [])[0] : (anime.year || '-');
    const rating = API.getAnimeNumericScore(anime) ?? '-';
    const availabilityText = episodeCount > 0 ? `${episodeCount} EP` : (anime.trailer ? 'Trailer' : 'Info');
    const availabilityTag = episodeCount > 0 ? `Eps ${episodeCount}` : (anime.trailer ? 'Trailer tersedia' : 'Belum ada episode');
    const genreLine = (anime.genre?.slice(0, 4) || []).map((genre) => safe(genre)).filter(Boolean).join(' | ');

    featured.innerHTML = `
        <img src="${anime.image || 'https://images.unsplash.com/photo-1541562232579-512a21360020'}" class="featured-img" data-slug="${anime.slug}" alt="${safe(anime.title)}">
        <div class="featured-gradient"></div>
        <div class="featured-content">
            <div class="hero-copy">
                <h1 class="hero-title">${safe(anime.title)}</h1>
                <div class="hero-meta-row">
                    <span class="hero-rating"><i class="fas fa-star"></i> ${safe(rating)}</span>
                    <span class="hero-pill">${safe(year)}</span>
                    <span class="hero-pill">${safe(availabilityText)}</span>
                    ${genreLine ? `<span class="hero-genres">${genreLine}</span>` : ''}
                </div>
                <p class="hero-synopsis line-clamp-3 line-clamp-md-none">${synopsis || 'Sinopsis belum tersedia.'}</p>
                <div class="tags">
                    ${anime.genre?.slice(0, 3).map((genre) => `<span class="tag">${safe(genre)}</span>`).join('') || '<span class="tag">Anime</span>'}
                    <span class="tag">${safe(availabilityTag)}</span>
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
        const selected = allAnime.find((item) => item.slug === slug) || heroCandidates.find((item) => item.slug === slug);
        if (selected) openPlayer(selected);
    });

    featured.querySelector('.fav-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(e.currentTarget.dataset.slug);
    });

    featured.querySelectorAll('.hero-dot').forEach((dot) => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const selected = heroCandidates.find((item) => item.slug === dot.dataset.slug);
            if (selected) renderFeatured(selected);
        });
    });
}

let currentGenre = 'Semua';

function renderGenrePills() {
    const genres = new Set();
    allAnime.forEach((anime) => anime.genre?.forEach((genre) => genres.add(genre)));
    const genreList = ['Semua', ...Array.from(genres).sort()];

    const container = document.querySelector('.category-scroll');
    if (!container) return;

    container.innerHTML = genreList.map((genre) =>
        `<div class="pill ${genre === currentGenre ? 'active' : ''}" data-genre="${genre.replace(/"/g, '&quot;')}">${genre.replace(/"/g, '&quot;')}</div>`
    ).join('');

    container.querySelectorAll('.pill').forEach((pill) => {
        pill.addEventListener('click', () => {
            currentGenre = pill.dataset.genre || 'Semua';
            document.querySelectorAll('.pill').forEach((node) => node.classList.remove('active'));
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

    container.innerHTML = continueAnime.map((anime) => UI.renderHorizontalCard(anime, 'continue')).join('');

    container.querySelectorAll('.anime-card-wide').forEach((card) => {
        card.addEventListener('click', () => {
            const slug = card.dataset.slug;
            const historyItem = continueAnime.find((item) => item.slug === slug);
            if (historyItem) openContinueFromHistory(historyItem);
        });
    });
}

async function openContinueFromHistory(historyItem) {
    if (!historyItem?.slug) return;

    let anime = allAnime.find((item) => item.slug === historyItem.slug);
    if (!anime) {
        UI.showLoading(true);
        try {
            const res = await API.getDetail(historyItem.slug);
            if (!res.success) throw new Error('no data');
            anime = res.data;
        } catch (e) {
            UI.showNotification('Gagal memuat anime dari riwayat', 2500, 'error');
            return;
        } finally {
            UI.showLoading(false);
        }
    }

    const episode = Storage.findResumeEpisode(anime, historyItem);
    openPlayer(anime, episode);
}

function renderRecommendations() {
    const filtered = currentGenre === 'Semua'
        ? allAnime
        : allAnime.filter((anime) => (anime.genre || []).includes(currentGenre));

    const recommendations = API.getShuffledDiscoverySelection(filtered, `${homeShuffleSeed}:recommend:${currentGenre}`, {
        minScore: 7.2,
        minPool: 18,
        maxPool: 36,
        limit: 12,
        preferPlayable: true
    });

    const container = document.getElementById('recommendList');
    if (!container) return;

    if (recommendations.length === 0) {
        container.innerHTML = `<div class="empty" style="padding:24px;color:var(--ns-muted);">Tidak ada anime untuk genre ini</div>`;
        return;
    }

    container.innerHTML = recommendations.map((anime) => UI.renderHorizontalCard(anime, 'recommend')).join('');

    container.querySelectorAll('.anime-card-wide').forEach((card) => {
        card.addEventListener('click', () => {
            const selected = allAnime.find((anime) => anime.slug === card.dataset.slug);
            if (selected) openPlayer(selected);
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
        allAnime.find((anime) => String(anime.slug) === String(slug)) ||
        heroCandidates.find((anime) => String(anime.slug) === String(slug)) ||
        Storage.getFavorites().find((anime) => String(anime.slug) === String(slug)) ||
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

let currentAnime = null;
let currentEpisodes = [];
let currentEpisode = null;
let currentMediaResponse = null; // hasil API.getVideoSources untuk episode aktif
let currentSelectedQuality = null;
let videoElement = null;
let iframeElement = null;
let settings = { speed: 1.0 };

// Add fullscreen change event listener
// Listen for openPlayer event from detail page
document.addEventListener('openPlayer', (e) => {
    const data = e.detail;
    if (data) {
        window.openPlayer(data.anime || data, data.currentEpisode || data.episode || null);
    }
});

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function handleFullscreenChange() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || 
                           document.mozFullScreenElement || document.msFullscreenElement);
    
    // Add/remove class to body for CSS targeting
    document.body.classList.toggle('video-fullscreen', isFullscreen);
    
    // Handle orientation lock only for video fullscreen
    if (isFullscreen) {
        tryLockLandscape();
    } else {
        tryUnlockOrientation();
    }
    
    applyFullscreenMode(isFullscreen);
}

function applyFullscreenMode(isActive) {
    const overlay = document.getElementById('playerOverlay');
    if (!overlay) return;
    overlay.classList.toggle('player-fullscreen-active', !!isActive);
}

/** Coba kunci orientasi landscape (Android Chrome + fullscreen; iOS sering tidak support). */
function tryLockLandscape() {
    try {
        const o = screen.orientation;
        if (o && typeof o.lock === 'function') {
            o.lock('landscape')
                .catch(() => o.lock('landscape-primary').catch(() => {}));
        }
    } catch (e) {}
}

function tryUnlockOrientation() {
    try {
        const o = screen.orientation;
        if (o && typeof o.unlock === 'function') {
            o.unlock();
        }
    } catch (e) {}
}

/** @returns {boolean} true jika fullscreen API dipakai */
function tryVideoElementFullscreen() {
    try {
        if (videoElement && videoElement.requestFullscreen) {
            const p = videoElement.requestFullscreen();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    applyFullscreenMode(true);
                    tryLockLandscape();
                }).catch(() => applyFullscreenMode(true));
                return true;
            }
            applyFullscreenMode(true);
            tryLockLandscape();
            return true;
        }

        if (videoElement && videoElement.webkitEnterFullscreen) {
            videoElement.webkitEnterFullscreen();
            applyFullscreenMode(true);
            tryLockLandscape();
            return true;
        }
    } catch (e) {}
    return false;
}

function toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        try {
            document.exitFullscreen();
        } catch (e) {}
        try {
            document.webkitExitFullscreen?.();
        } catch (e2) {}
        tryUnlockOrientation();
        applyFullscreenMode(false);
        return;
    }

    // Fallback mode (Fullscreen API tidak ada): toggle pakai class saja.
    const overlay = document.getElementById('playerOverlay');
    if (!document.fullscreenElement && overlay && overlay.classList.contains('player-fullscreen-active')) {
        tryUnlockOrientation();
        applyFullscreenMode(false);
        return;
    }

    // Di HP: fullscreen ke kontainer video + kunci landscape (Chrome Android). iOS sering tidak support lock.
    const container = document.querySelector('#playerOverlay .video-container');
    const preferContainer =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 900px)').matches;

    try {
        if (preferContainer && container && container.requestFullscreen) {
            const p = container.requestFullscreen({ navigationUI: 'hide' });
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    applyFullscreenMode(true);
                    tryLockLandscape();
                }).catch(() => {
                    if (!tryVideoElementFullscreen()) applyFullscreenMode(true);
                });
                return;
            }
            applyFullscreenMode(true);
            tryLockLandscape();
            return;
        }
    } catch (e) {}

    if (!tryVideoElementFullscreen()) {
        applyFullscreenMode(true);
    }
}

function ensureOverlayFavoriteButton() {
    if (document.getElementById('overlayFavoriteBtn')) return;
    const title = document.getElementById('overlayTitle');
    if (!title || !title.parentElement) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'overlayFavoriteBtn';
    btn.className = 'player-fav-btn';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentAnime || currentAnime.slug == null) return;
        Storage.toggleFavorite(currentAnime);
        const on = Storage.isFavorite(currentAnime.slug);
        UI.showNotification(on ? 'Ditambahkan ke Daftar Saya' : 'Dihapus dari Daftar Saya', 2000, 'success');
        UI.applyFavoriteUiState(String(currentAnime.slug));
    });
    title.parentElement.insertBefore(btn, title.nextSibling);
}

function closePlayer() {
    if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
    }
    if (iframeElement) {
        iframeElement.src = '';
    }
    document.getElementById('playerOverlay').style.display = 'none';
    document.body.style.overflow = 'auto';
    applyFullscreenMode(false);
    tryUnlockOrientation();
    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch (e) {}
    }
    if (document.webkitFullscreenElement) {
        try { document.webkitExitFullscreen?.(); } catch (e) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('videoPlayer');
    if (!videoElement) return;
    iframeElement = document.getElementById('videoIframe');

    settings = Storage.getSettings();
    videoElement.playbackRate = settings.speed;

    const closeBtn = document.querySelector('.close-player');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePlayer);
    }

    ensureOverlayFavoriteButton();

    // Fullscreen UX: tombol custom + dblclick.
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer && !document.querySelector('.fullscreen-player-btn')) {
        const fsBtn = document.createElement('button');
        fsBtn.className = 'fullscreen-player-btn';
        fsBtn.type = 'button';
        fsBtn.setAttribute('aria-label', 'Fullscreen');
        fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
        Object.assign(fsBtn.style, {
            position: 'absolute',
            top: '20px',
            right: '65px',
            width: '35px',
            height: '35px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)',
            zIndex: 11,
            cursor: 'pointer'
        });
        fsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFullscreen();
        });
        videoContainer.appendChild(fsBtn);
    }

    document.addEventListener('fullscreenchange', () => {
        const fs = !!document.fullscreenElement;
        applyFullscreenMode(fs);
        if (fs) {
            tryLockLandscape();
        } else {
            tryUnlockOrientation();
        }
    });

    document.addEventListener('webkitfullscreenchange', () => {
        const fs = !!document.webkitFullscreenElement;
        if (fs) {
            applyFullscreenMode(true);
            tryLockLandscape();
        } else {
            applyFullscreenMode(false);
            tryUnlockOrientation();
        }
    });

    videoElement.addEventListener('dblclick', (e) => {
        e.preventDefault();
        toggleFullscreen();
    });

    const speedSelect = document.getElementById('overlaySpeedSelect');
    if (speedSelect) {
        speedSelect.addEventListener('change', (e) => {
            const speed = parseFloat(e.target.value);
            if (videoElement) {
                videoElement.playbackRate = speed;
                settings.speed = speed;
                Storage.saveSettings(settings);
            }
        });
    }

    let lastHistorySync = 0;
    function syncWatchProgressToHistory() {
        if (!currentAnime || !currentEpisode || !videoElement) return;
        // Hanya untuk <video> langsung (bukan iframe embed)
        if (videoElement.style.display === 'none') return;
        const t = videoElement.currentTime;
        const d = videoElement.duration;
        Storage.setProgress(currentEpisode.url, t);
        Storage.updateHistoryWatchProgress(currentAnime.slug, {
            lastEpisodeNumber: currentEpisode.number,
            lastEpisodeUrl: currentEpisode.url,
            lastProgressSeconds: t,
            lastDurationSeconds: Number.isFinite(d) && d > 0 ? d : undefined,
        });
    }

    videoElement.addEventListener('timeupdate', () => {
        if (currentEpisode) {
            Storage.setProgress(currentEpisode.url, videoElement.currentTime);
        }
        const now = Date.now();
        if (now - lastHistorySync > 2000) {
            lastHistorySync = now;
            syncWatchProgressToHistory();
        }
    });

    videoElement.addEventListener('pause', () => {
        lastHistorySync = 0;
        syncWatchProgressToHistory();
    });

    videoElement.addEventListener('seeked', () => {
        syncWatchProgressToHistory();
    });
});

function getQualityOrder() {
    return ['1080p', '720p', '480p', '360p', '240p', '4k'];
}

function getAvailableQualities(sources, streams) {
    const set = new Set();
    if (sources && typeof sources === 'object') {
        Object.keys(sources).forEach(k => set.add(k));
    }
    if (streams && typeof streams === 'object') {
        Object.keys(streams).forEach(k => set.add(k));
    }
    const order = getQualityOrder();
    const ordered = order.filter(q => set.has(q));
    const rest = Array.from(set).filter(q => !order.includes(q)).sort();
    return ordered.concat(rest);
}

function pickFromMap(map, preferKey) {
    if (!map || typeof map !== 'object') return null;
    if (preferKey && map[preferKey]) return map[preferKey];
    const keys = Object.keys(map);
    if (keys.length === 0) return null;
    return map[keys[0]] || null;
}

function setQualityUI(quality) {
    const tagEl = document.getElementById('currentQualityTag');
    if (tagEl && quality) tagEl.textContent = quality;

    const container = document.getElementById('qualityButtons');
    if (!container) return;
    container.querySelectorAll('.quality-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.quality === quality);
    });
}

function renderQualityButtons(qualities, activeQuality) {
    const container = document.getElementById('qualityButtons');
    if (!container) return;

    if (!qualities || qualities.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = qualities.map(q => (
        `<button type="button" class="quality-btn ${q === activeQuality ? 'active' : ''}" data-quality="${q}">${q}</button>`
    )).join('');

    container.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = btn.dataset.quality;
            if (!q) return;
            currentSelectedQuality = q;
            setQualityUI(q);
            if (currentMediaResponse) {
                playCurrentEpisodeMediaByQuality(q);
            }
        });
    });
}

function playCurrentEpisodeMediaByQuality(quality) {
    if (!currentMediaResponse) return;
    if (!videoElement || !iframeElement) return;

    const res = currentMediaResponse;
    const sources = res.sources || {};
    const streams = res.streams || {};

    let videoUrl = pickFromMap(sources, quality);
    let streamUrl = pickFromMap(streams, quality);

    // Pastikan hanya URL absolut yang dipakai (hindari 404 dari token/ID seperti "3561110768215")
    const isValidUrl = (u) => u && typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('//'));
    
    // Handle base64 encoded URLs from streaming services
    if (videoUrl && !isValidUrl(videoUrl)) {
        // Try to decode if it looks like base64
        try {
            const decoded = atob(videoUrl);
            if (decoded && isValidUrl(decoded)) {
                videoUrl = decoded;
            } else {
                videoUrl = null;
            }
        } catch {
            videoUrl = null;
        }
    }
    
    if (streamUrl && !isValidUrl(streamUrl)) {
        // Try to decode if it looks like base64
        try {
            const decoded = atob(streamUrl);
            if (decoded && isValidUrl(decoded)) {
                streamUrl = decoded;
            } else {
                streamUrl = null;
            }
        } catch {
            streamUrl = null;
        }
    }

    console.log('Playing video with quality:', quality, 'videoUrl:', videoUrl, 'streamUrl:', streamUrl);

    if (videoUrl) {
        if (iframeElement) iframeElement.style.display = 'none';
        videoElement.style.display = '';
        videoElement.src = videoUrl;
        videoElement.load();
        
        // Add error handling for video playback
        videoElement.onerror = function(e) {
            console.error('Video error:', e);
            UI.showNotification('Gagal memuat video. Coba kualitas lain.', 3000, 'error');
        };
        
        videoElement.onloadeddata = function() {
            console.log('Video loaded successfully');
            videoElement.play().catch(error => {
                console.error('Video play error:', error);
                UI.showNotification('Gagal memutar video. Coba episode lain.', 3000, 'error');
            });
        };
    } else if (streamUrl && isValidUrl(streamUrl)) {
        // Guard: jangan sampai kita embed "halaman episode asli" yang penuh UI.
        if (/\/episode\/\d+/.test(streamUrl) && /\/series\//.test(streamUrl)) {
            throw new Error('StreamUrl terdeteksi mengarah ke halaman episode (bukan media).');
        }
        videoElement.style.display = 'none';
        iframeElement.style.display = '';
        iframeElement.src = streamUrl;
        
        // Add error handling for iframe
        iframeElement.onerror = function() {
            console.error('Iframe error');
            UI.showNotification('Gagal memuat video embed.', 3000, 'error');
        };
    } else if (streamUrl) {
        throw new Error('URL stream tidak valid (bukan absolute URL).');
    } else {
        throw new Error('Tidak ada sumber video/stream yang valid');
    }
}

window.openPlayer = function(anime, episode = null) {
    currentAnime = anime;
    currentEpisodes = anime.episodes || [];

    // History (untuk bagian "Lanjutkan Menonton" dan halaman history)
    Storage.addToHistory(anime);

    document.getElementById('overlayTitle').textContent = anime.title || '';
    document.getElementById('overlayDescription').textContent = anime.synopsis || 'Sinopsis tidak tersedia.';

    const detailEl = document.getElementById('overlayAnimeDetail');
    if (detailEl) {
        const parts = [];
        if (anime.japanese_title) parts.push(`<span class="overlay-jp-title">${String(anime.japanese_title).replace(/</g, '&lt;')}</span>`);
        const meta = [];
        if (anime.type) meta.push(anime.type);
        if (anime.studio) meta.push(anime.studio);
        if (anime.release_date) meta.push(anime.release_date);
        if (anime.status) meta.push(anime.status);
        if (anime.score) meta.push(`★ ${anime.score}`);
        if (anime.duration) meta.push(anime.duration);
        if (meta.length) parts.push(`<span class="overlay-meta">${meta.join(' • ')}</span>`);
        if (anime.genre && anime.genre.length) parts.push(`<span class="overlay-genres">${anime.genre.map(g => `<span class="overlay-genre-tag">${String(g).replace(/</g, '&lt;')}</span>`).join('')}</span>`);
        detailEl.innerHTML = parts.length ? parts.join('') : '';
    }

    if (!episode && currentEpisodes.length > 0) {
        episode = currentEpisodes[0];
    }

    if (episode) {
        loadEpisode(episode);
    }

    renderEpisodeList(currentEpisodes, episode);

    document.getElementById('playerOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    ensureOverlayFavoriteButton();
    const favBtn = document.getElementById('overlayFavoriteBtn');
    if (favBtn) favBtn.dataset.slug = String(anime.slug || '');
    UI.applyFavoriteUiState(String(anime.slug || ''));
};

async function loadEpisode(episode) {
    if (!episode) return;

    if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
    }
    if (iframeElement) {
        iframeElement.src = '';
    }

    currentEpisode = episode;

    document.querySelectorAll('.ep-card').forEach(el => el.classList.remove('active'));
    const activeCard = Array.from(document.querySelectorAll('.ep-card')).find(el => {
        try {
            const ep = JSON.parse(decodeURIComponent(el.dataset.episode));
            return ep.number === episode.number;
        } catch (e) {
            return false;
        }
    });
    if (activeCard) activeCard.classList.add('active');

    document.getElementById('currentEpisodeTag').textContent = `Episode ${episode.number}`;

    UI.showLoading(true, 'Memuat video...');
    try {
        // Try API first
        let res = null;
        try {
            res = await API.getVideoSources(episode.url);
        } catch (apiError) {
            console.warn('API failed, using static data:', apiError);
        }
        
        // If API fails or returns no success, use episode data directly
        if (!res || !res.success) {
            if (episode.sources && Object.keys(episode.sources).length > 0) {
                res = {
                    success: true,
                    sources: episode.sources,
                    streams: {},
                    default: episode.default || '360p',
                    url: episode.url
                };
            } else {
                throw new Error('Tidak ada sumber video');
            }
        }

        currentMediaResponse = res;
        const qualities = getAvailableQualities(res.sources || {}, res.streams || {});
        const defaultQuality = res.default || qualities[0] || '360p';
        const initialQuality = qualities.includes(defaultQuality) ? defaultQuality : (qualities[0] || defaultQuality);
        currentSelectedQuality = initialQuality;

        setQualityUI(initialQuality);
        renderQualityButtons(qualities, initialQuality);
        playCurrentEpisodeMediaByQuality(initialQuality);

        Storage.addWatchedEpisode(currentAnime.slug, episode.number);

    } catch (err) {
        console.error('Load episode error:', err);
        UI.showNotification('Gagal memuat video. Coba episode lain.', 3000, 'error');
    } finally {
        UI.showLoading(false);
    }
}

function renderEpisodeList(episodes, activeEpisode) {
    const container = document.getElementById('episodeList');
    
    // Separate trailer from regular episodes
    const trailerEpisode = episodes.find(ep => 
        ep.number === 0 || (ep.number === 1 && ep.title && ep.title.toLowerCase().includes('trailer'))
    );
    const regularEpisodes = episodes.filter(ep => 
        ep.number !== 0 && !(ep.number === 1 && ep.title && ep.title.toLowerCase().includes('trailer'))
    );
    
    let html = '';
    
    // Add trailer first if exists
    if (trailerEpisode) {
        html += `
            <div class="ep-card trailer-card" data-episode='${encodeURIComponent(JSON.stringify(trailerEpisode))}'>
                <i class="fas fa-film" style="font-size: 1.2rem; margin-bottom: 5px; display: block;"></i>
                <div>Trailer</div>
            </div>
        `;
    }
    
    // Add regular episodes
    regularEpisodes.forEach(ep => {
        html += `
            <div class="ep-card ${activeEpisode && ep.number === activeEpisode.number ? 'active' : ''}" data-episode='${encodeURIComponent(JSON.stringify(ep))}'>
                <div>EP ${ep.number}</div>
            </div>
        `;
    });
    
    // Show message if no episodes but has trailer
    if (regularEpisodes.length === 0 && !trailerEpisode) {
        html = '<div class="empty" style="padding: 20px; text-align: center; color: var(--ns-muted);">Tidak ada episode yang tersedia</div>';
    } else if (regularEpisodes.length === 0 && trailerEpisode) {
        html += '<div class="notice" style="padding: 10px; text-align: center; color: var(--ns-muted); font-size: 0.9rem;">Anime ini hanya memiliki trailer, tidak ada episode.</div>';
    }
    
    container.innerHTML = html;

    container.querySelectorAll('.ep-card').forEach(el => {
        el.addEventListener('click', () => {
            try {
                const ep = JSON.parse(decodeURIComponent(el.dataset.episode));
                loadEpisode(ep);
            } catch (e) {
                console.error('Error parsing episode data', e);
            }
        });
    });
}
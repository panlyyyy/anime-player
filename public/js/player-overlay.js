let currentAnime = null;
let currentEpisodes = [];
let currentEpisode = null;
let currentMediaResponse = null;
let currentSelectedQuality = null;
let videoElement = null;
let iframeElement = null;
let settings = { speed: 1.0 };
let orientationGuardTimer = null;

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
    const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    );

    document.body.classList.toggle('video-fullscreen', isFullscreen);
    applyFullscreenMode(isFullscreen);
    queueOrientationSync(0);
}

function applyFullscreenMode(isActive) {
    const overlay = document.getElementById('playerOverlay');
    if (!overlay) return;
    overlay.classList.toggle('player-fullscreen-active', !!isActive);
}

function isMobileViewport() {
    return typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 900px)').matches
        : true;
}

function isAnyFullscreenActive() {
    const overlay = document.getElementById('playerOverlay');
    return !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        overlay?.classList.contains('player-fullscreen-active')
    );
}

function syncPreferredOrientation() {
    if (!isMobileViewport()) return;
    if (isAnyFullscreenActive()) {
        tryLockLandscape();
        return;
    }
    tryUnlockOrientation();
    tryLockPortrait();
}

function queueOrientationSync(delay = 120) {
    if (orientationGuardTimer) {
        clearTimeout(orientationGuardTimer);
    }
    orientationGuardTimer = setTimeout(() => {
        orientationGuardTimer = null;
        syncPreferredOrientation();
    }, delay);
}

function tryLockLandscape() {
    try {
        const o = screen.orientation;
        if (o && typeof o.lock === 'function') {
            o.lock('landscape').catch(() => o.lock('landscape-primary').catch(() => {}));
        }
    } catch (e) {}
}

function tryLockPortrait() {
    try {
        const o = screen.orientation;
        if (o && typeof o.lock === 'function') {
            o.lock('portrait').catch(() => o.lock('portrait-primary').catch(() => {}));
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
        applyFullscreenMode(false);
        queueOrientationSync(0);
        return;
    }

    const overlay = document.getElementById('playerOverlay');
    if (!document.fullscreenElement && overlay && overlay.classList.contains('player-fullscreen-active')) {
        applyFullscreenMode(false);
        queueOrientationSync(0);
        return;
    }

    const container = document.querySelector('#playerOverlay .video-container');
    const preferContainer =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 900px)').matches;
    const preferNativeVideoFullscreen =
        !!videoElement &&
        videoElement.style.display !== 'none' &&
        !!videoElement.getAttribute('src');

    if (preferNativeVideoFullscreen && tryVideoElementFullscreen()) {
        return;
    }

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

function ensureAvailabilityNoticeElement() {
    let note = document.getElementById('overlayAvailabilityNote');
    if (note) return note;

    const description = document.getElementById('overlayDescription');
    if (!description || !description.parentElement) return null;

    note = document.createElement('div');
    note.id = 'overlayAvailabilityNote';
    Object.assign(note.style, {
        display: 'none',
        margin: '14px 0 0',
        padding: '12px 14px',
        borderRadius: '12px',
        background: 'rgba(99, 102, 241, 0.12)',
        border: '1px solid rgba(99, 102, 241, 0.24)',
        color: '#d4d4d8',
        fontSize: '0.9rem',
        lineHeight: '1.5'
    });
    description.insertAdjacentElement('afterend', note);
    return note;
}

function setAvailabilityNotice(message = '', tone = 'info') {
    const note = ensureAvailabilityNoticeElement();
    if (!note) return;

    if (!message) {
        note.style.display = 'none';
        note.textContent = '';
        return;
    }

    const tones = {
        info: {
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.24)'
        },
        warning: {
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.24)'
        }
    };

    const style = tones[tone] || tones.info;
    note.style.display = 'block';
    note.style.background = style.background;
    note.style.border = style.border;
    note.textContent = message;
}

function ensurePlayerEmptyState() {
    let empty = document.getElementById('playerEmptyState');
    if (empty) return empty;

    const container = document.querySelector('#playerOverlay .video-container');
    if (!container) return null;

    empty = document.createElement('div');
    empty.id = 'playerEmptyState';
    Object.assign(empty.style, {
        position: 'absolute',
        inset: '0',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(9, 9, 11, 0.55), rgba(9, 9, 11, 0.95))',
        zIndex: '2'
    });

    const content = document.createElement('div');
    Object.assign(content.style, {
        maxWidth: '420px'
    });

    const poster = document.createElement('img');
    poster.id = 'playerEmptyPoster';
    Object.assign(poster.style, {
        width: '112px',
        aspectRatio: '2 / 3',
        objectFit: 'cover',
        borderRadius: '16px',
        margin: '0 auto 16px',
        display: 'none',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)'
    });

    const title = document.createElement('div');
    title.id = 'playerEmptyTitle';
    Object.assign(title.style, {
        fontSize: '1.1rem',
        fontWeight: '700',
        marginBottom: '8px'
    });

    const message = document.createElement('div');
    message.id = 'playerEmptyMessage';
    Object.assign(message.style, {
        color: '#d4d4d8',
        fontSize: '0.95rem',
        lineHeight: '1.55'
    });

    content.appendChild(poster);
    content.appendChild(title);
    content.appendChild(message);
    empty.appendChild(content);
    container.appendChild(empty);
    return empty;
}

function hidePlayerEmptyState() {
    const empty = ensurePlayerEmptyState();
    if (!empty) return;
    empty.style.display = 'none';
}

function showPlayerEmptyState(title, message, image = '') {
    const empty = ensurePlayerEmptyState();
    if (!empty) return;

    const poster = document.getElementById('playerEmptyPoster');
    const titleEl = document.getElementById('playerEmptyTitle');
    const messageEl = document.getElementById('playerEmptyMessage');

    if (poster) {
        if (image) {
            poster.src = image;
            poster.style.display = 'block';
        } else {
            poster.removeAttribute('src');
            poster.style.display = 'none';
        }
    }

    if (titleEl) titleEl.textContent = title || 'Belum ada media';
    if (messageEl) messageEl.textContent = message || 'Belum ada video yang bisa diputar untuk anime ini.';
    empty.style.display = 'flex';
}

function resetMediaElements() {
    currentMediaResponse = null;
    currentSelectedQuality = null;
    hidePlayerEmptyState();

    if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
        videoElement.onerror = null;
        videoElement.onloadeddata = null;
        videoElement.style.display = '';
    }

    if (iframeElement) {
        iframeElement.src = '';
        iframeElement.onerror = null;
        iframeElement.style.display = 'none';
    }
}

function closePlayer() {
    resetMediaElements();
    currentEpisode = null;
    document.getElementById('playerOverlay').style.display = 'none';
    document.body.style.overflow = 'auto';
    applyFullscreenMode(false);
    queueOrientationSync(0);
    setAvailabilityNotice('');
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
    syncPreferredOrientation();

    settings = Storage.getSettings();
    videoElement.playbackRate = settings.speed;

    if (iframeElement) {
        iframeElement.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
        iframeElement.setAttribute('allowfullscreen', 'true');
    }

    const closeBtn = document.querySelector('.close-player');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePlayer);
    }

    ensureOverlayFavoriteButton();
    ensureAvailabilityNoticeElement();
    ensurePlayerEmptyState();

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
        queueOrientationSync(0);
    });

    document.addEventListener('webkitfullscreenchange', () => {
        const fs = !!document.webkitFullscreenElement;
        applyFullscreenMode(fs);
        queueOrientationSync(0);
    });

    window.addEventListener('pageshow', () => queueOrientationSync(0));
    window.addEventListener('focus', () => queueOrientationSync(0));
    window.addEventListener('resize', () => queueOrientationSync(120), { passive: true });
    window.addEventListener('orientationchange', () => queueOrientationSync(180));
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            queueOrientationSync(0);
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
        if (!currentAnime || !currentEpisode || !videoElement || isTrailerItem(currentEpisode)) return;
        if (videoElement.style.display === 'none') return;
        const t = videoElement.currentTime;
        const d = videoElement.duration;
        Storage.setProgress(currentEpisode, t);
        Storage.updateHistoryWatchProgress(currentAnime.slug, {
            lastEpisodeKey: Storage.getEpisodeKey(currentEpisode),
            lastEpisodeNumber: currentEpisode.number,
            lastEpisodeUrl: currentEpisode.url,
            lastProgressSeconds: t,
            lastDurationSeconds: Number.isFinite(d) && d > 0 ? d : undefined,
        });
    }

    videoElement.addEventListener('timeupdate', () => {
        if (currentEpisode && !isTrailerItem(currentEpisode)) {
            Storage.setProgress(currentEpisode, videoElement.currentTime);
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
    if (tagEl && quality != null) tagEl.textContent = quality;

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

function isValidUrl(u) {
    return !!(u && typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('//')));
}

function isTrailerItem(item) {
    return item?.kind === 'trailer';
}

function getMediaKey(item) {
    if (!item) return '';
    if (isTrailerItem(item)) {
        return `trailer::${item.embed_url || item.url || item.watch_url || item.title || 'default'}`;
    }
    return `episode::${item.number ?? ''}`;
}

function isLikelyIframeSource(url) {
    if (!isValidUrl(url)) return false;

    try {
        const parsed = new URL(url, window.location.origin);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();
        const looksLikeDirectVideo = /\.(mp4|m3u8|webm|mkv|mov)$/i.test(path);

        if (path.includes('streaming.php')) return true;
        if (host.includes('youtube.com') || host.includes('youtu.be')) return true;
        if (host.includes('berkasdrive.com') || host.includes('mitedrive.com') || host.includes('dlgan.space')) return true;
        if (path.includes('/streaming/') || path.includes('/embed/') || path.includes('/view/')) return true;
        if (looksLikeDirectVideo) return false;
    } catch (e) {
        return false;
    }

    return false;
}

function withAutoplay(url) {
    if (!isValidUrl(url)) return url;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.hostname.includes('youtube.com')) {
            parsed.searchParams.set('autoplay', '1');
            parsed.searchParams.set('rel', '0');
        }
        return parsed.toString();
    } catch (e) {
        return url;
    }
}

function playEmbedUrl(url) {
    if (!iframeElement || !videoElement) return;
    hidePlayerEmptyState();
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    videoElement.style.display = 'none';
    iframeElement.referrerPolicy = 'strict-origin-when-cross-origin';
    iframeElement.style.display = '';
    iframeElement.src = withAutoplay(url);
    iframeElement.onerror = function () {
        UI.showNotification('Gagal memuat video embed.', 3000, 'error');
    };
}

function playVideoUrl(url) {
    if (!videoElement || !iframeElement) return;
    hidePlayerEmptyState();
    iframeElement.src = '';
    iframeElement.style.display = 'none';
    videoElement.style.display = '';
    videoElement.src = url;
    videoElement.load();

    videoElement.onerror = function (e) {
        console.error('Video error:', e);
        if (isLikelyIframeSource(url)) {
            playEmbedUrl(url);
            return;
        }
        UI.showNotification('Gagal memuat video. Coba kualitas lain.', 3000, 'error');
    };

    videoElement.onloadeddata = function () {
        videoElement.play().catch((error) => {
            console.error('Video play error:', error);
            UI.showNotification('Gagal memutar video. Coba episode lain.', 3000, 'error');
        });
    };
}

function updateActiveEpisodeCard(activeItem) {
    const activeKey = getMediaKey(activeItem);
    document.querySelectorAll('.ep-card[data-key]').forEach((el) => {
        el.classList.toggle('active', el.dataset.key === activeKey);
    });
}

function buildMediaPlaylist(anime) {
    const list = [];

    if (anime?.trailer && (anime.trailer.embed_url || anime.trailer.url || anime.trailer.watch_url)) {
        list.push({
            kind: 'trailer',
            title: 'Trailer',
            embed_url: anime.trailer.embed_url || anime.trailer.url,
            url: anime.trailer.url || anime.trailer.embed_url || anime.trailer.watch_url,
            watch_url: anime.trailer.watch_url || anime.trailer.url,
            platform: anime.trailer.platform || '',
        });
    }

    (anime?.episodes || []).forEach((episode) => {
        list.push({
            ...episode,
            kind: 'episode',
            title: episode.title || `Episode ${episode.number}`,
        });
    });

    return list;
}

function resolveRequestedMediaItem(list, requested) {
    if (!requested || !Array.isArray(list) || list.length === 0) return null;
    if (isTrailerItem(requested)) {
        return list.find((item) => isTrailerItem(item)) || null;
    }
    if (requested.number != null) {
        return list.find((item) => !isTrailerItem(item) && Number(item.number) === Number(requested.number)) || null;
    }
    if (requested.url) {
        return list.find((item) => item.url === requested.url) || null;
    }
    return null;
}

function updateEpisodeSection(visible, title = 'Trailer dan Episode') {
    const container = document.getElementById('episodeList');
    const heading = container?.previousElementSibling;
    if (heading) {
        heading.style.display = visible ? '' : 'none';
        heading.textContent = title;
    }
    if (container) {
        container.style.display = visible ? 'grid' : 'none';
    }
}

function showNoMediaState(anime) {
    resetMediaElements();
    renderQualityButtons([], null);
    setQualityUI('Info');
    document.getElementById('currentEpisodeTag').textContent = 'Info';
    updateEpisodeSection(false);
    showPlayerEmptyState(
        anime?.title || 'Belum ada media',
        anime?.no_streaming_message || 'Anime ini belum punya episode atau trailer yang bisa diputar saat ini.',
        anime?.image || ''
    );
    setAvailabilityNotice(
        anime?.no_streaming_message || 'Anime ini tampil di katalog, tapi episode dan trailer belum tersedia.',
        'warning'
    );
}

function playCurrentEpisodeMediaByQuality(quality) {
    if (!currentMediaResponse) return;
    if (!videoElement || !iframeElement) return;

    const res = currentMediaResponse;
    const sources = res.sources || {};
    const streams = res.streams || {};

    let videoUrl = pickFromMap(sources, quality);
    let streamUrl = pickFromMap(streams, quality);

    if (videoUrl && !isValidUrl(videoUrl)) {
        try {
            if (videoUrl.includes('id=')) {
                const idMatch = videoUrl.match(/id=([^&]+)/);
                if (idMatch && idMatch[1]) {
                    const decodedId = atob(idMatch[1]);
                    if (decodedId && isValidUrl(decodedId)) {
                        videoUrl = decodedId;
                    }
                }
            } else {
                const decoded = atob(videoUrl);
                videoUrl = decoded && isValidUrl(decoded) ? decoded : null;
            }
        } catch (error) {
            console.warn('Failed to decode source URL:', error);
            videoUrl = null;
        }
    }

    if (streamUrl && !isValidUrl(streamUrl)) {
        try {
            const decoded = atob(streamUrl);
            streamUrl = decoded && isValidUrl(decoded) ? decoded : null;
        } catch (error) {
            streamUrl = null;
        }
    }

    if (videoUrl && isLikelyIframeSource(videoUrl)) {
        streamUrl = streamUrl || videoUrl;
        videoUrl = null;
    }

    if (videoUrl) {
        playVideoUrl(videoUrl);
        return;
    }

    if (streamUrl && isValidUrl(streamUrl)) {
        if (/\/episode\/\d+/.test(streamUrl) && /\/series\//.test(streamUrl)) {
            throw new Error('Stream URL terdeteksi mengarah ke halaman episode, bukan media.');
        }
        playEmbedUrl(streamUrl);
        return;
    }

    throw new Error('Tidak ada sumber video atau embed yang valid.');
}

window.openPlayer = function (anime, episode = null) {
    currentAnime = anime;
    currentEpisodes = buildMediaPlaylist(anime);

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
        const numericScore = parseFloat(anime.score);
        if (Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 10) meta.push(`Rating ${numericScore}`);
        if (anime.duration) meta.push(anime.duration);
        if (meta.length) parts.push(`<span class="overlay-meta">${meta.join(' | ')}</span>`);
        if (anime.genre && anime.genre.length) parts.push(`<span class="overlay-genres">${anime.genre.map(g => `<span class="overlay-genre-tag">${String(g).replace(/</g, '&lt;')}</span>`).join('')}</span>`);
        detailEl.innerHTML = parts.length ? parts.join('') : '';
    }

    const preferredEpisode =
        resolveRequestedMediaItem(currentEpisodes, episode) ||
        currentEpisodes.find((item) => !isTrailerItem(item)) ||
        currentEpisodes.find((item) => isTrailerItem(item)) ||
        null;

    document.getElementById('playerOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    queueOrientationSync(0);

    renderEpisodeList(currentEpisodes, preferredEpisode);

    if (preferredEpisode) {
        loadEpisode(preferredEpisode);
    } else {
        currentEpisode = null;
        showNoMediaState(anime);
    }

    ensureOverlayFavoriteButton();
    const favBtn = document.getElementById('overlayFavoriteBtn');
    if (favBtn) favBtn.dataset.slug = String(anime.slug || '');
    UI.applyFavoriteUiState(String(anime.slug || ''));
};

async function loadEpisode(episode) {
    if (!episode) return;

    resetMediaElements();
    currentEpisode = episode;
    updateActiveEpisodeCard(episode);

    document.getElementById('currentEpisodeTag').textContent = isTrailerItem(episode)
        ? 'Trailer'
        : `Episode ${episode.number}`;

    if (isTrailerItem(episode)) {
        renderQualityButtons([], null);
        setQualityUI('Trailer');
        const trailerOnly = !currentEpisodes.some((item) => !isTrailerItem(item));
        setAvailabilityNotice(
            trailerOnly
                ? 'Anime ini saat ini hanya punya trailer, episode belum tersedia.'
                : 'Trailer tersedia di daftar sebelum episode.',
            'info'
        );

        const trailerUrl = episode.embed_url || episode.url || episode.watch_url;
        if (!trailerUrl) {
            showPlayerEmptyState(currentAnime?.title || 'Trailer', 'Trailer belum bisa diputar saat ini.', currentAnime?.image || '');
            return;
        }

        playEmbedUrl(trailerUrl);
        return;
    }

    setAvailabilityNotice(
        currentEpisodes.some((item) => isTrailerItem(item)) ? 'Trailer tersedia di daftar episode.' : '',
        'info'
    );

    UI.showLoading(true, 'Memuat video...');
    try {
        let res = null;

        if (episode.sources && Object.keys(episode.sources).length > 0) {
            res = {
                success: true,
                sources: episode.sources,
                streams: episode.streams || {},
                default: episode.default || '360p',
                url: episode.url,
                number: episode.number
            };
        }

        if (!res || (!Object.keys(res.sources || {}).length && !Object.keys(res.streams || {}).length)) {
            try {
                res = await API.getVideoSources(episode.url, episode.number);
            } catch (apiError) {
                console.warn('API episode gagal, memakai data lokal episode:', apiError);
            }
        }

        if (!res || !res.success || (!Object.keys(res.sources || {}).length && !Object.keys(res.streams || {}).length)) {
            showPlayerEmptyState(
                currentAnime?.title || 'Episode',
                'Sumber video untuk episode ini belum tersedia. Anda bisa coba trailer atau episode lain.',
                currentAnime?.image || ''
            );
            throw new Error('Tidak ada sumber video');
        }

        currentMediaResponse = res;
        const qualities = getAvailableQualities(res.sources || {}, res.streams || {});
        const defaultQuality = res.default || qualities[0] || '360p';
        const initialQuality = qualities.includes(defaultQuality) ? defaultQuality : (qualities[0] || defaultQuality);
        currentSelectedQuality = initialQuality;

        renderQualityButtons(qualities, initialQuality);
        setQualityUI(initialQuality);
        playCurrentEpisodeMediaByQuality(initialQuality);

        if (Number.isFinite(Number(episode.number))) {
            Storage.addWatchedEpisode(currentAnime.slug, Number(episode.number));
        }
    } catch (err) {
        console.error('Load episode error:', err);
        UI.showNotification('Gagal memuat video. Coba kualitas lain, trailer, atau episode lain.', 3500, 'error');
    } finally {
        UI.showLoading(false);
    }
}

function renderEpisodeList(episodes, activeEpisode) {
    const container = document.getElementById('episodeList');
    if (!container) return;

    if (!episodes || episodes.length === 0) {
        container.innerHTML = '';
        updateEpisodeSection(false);
        return;
    }

    const regularEpisodes = episodes.filter((item) => !isTrailerItem(item));
    const onlyTrailer = regularEpisodes.length === 0 && episodes.some((item) => isTrailerItem(item));
    updateEpisodeSection(true, 'Trailer dan Episode');

    let html = episodes.map((item) => {
        const isActive = activeEpisode && getMediaKey(item) === getMediaKey(activeEpisode);
        const label = isTrailerItem(item) ? 'Trailer' : `EP ${item.number}`;
        const icon = isTrailerItem(item) ? '<i class="fas fa-film" style="font-size: 1.1rem; margin-bottom: 6px; display: block;"></i>' : '';
        return `
            <div class="ep-card ${isActive ? 'active' : ''} ${isTrailerItem(item) ? 'trailer-card' : ''}" data-key="${getMediaKey(item)}" data-media='${encodeURIComponent(JSON.stringify(item))}'>
                ${icon}
                <div>${label}</div>
            </div>
        `;
    }).join('');

    if (onlyTrailer) {
        html += '<div class="empty" style="grid-column: 1 / -1; padding: 12px 8px; font-size: 0.9rem;">Episode belum tersedia, saat ini hanya ada trailer.</div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.ep-card[data-media]').forEach((el) => {
        el.addEventListener('click', () => {
            try {
                const media = JSON.parse(decodeURIComponent(el.dataset.media));
                loadEpisode(media);
            } catch (e) {
                console.error('Error parsing media data', e);
            }
        });
    });
}

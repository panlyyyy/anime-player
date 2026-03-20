let currentAnime = null;
let currentEpisodes = [];
let currentEpisode = null;
let currentMediaResponse = null; // hasil API.getVideoSources untuk episode aktif
let currentSelectedQuality = null;
let videoElement = null;
let iframeElement = null;
let settings = { speed: 1.0 };

function applyFullscreenMode(isActive) {
    const overlay = document.getElementById('playerOverlay');
    if (!overlay) return;
    overlay.classList.toggle('player-fullscreen-active', !!isActive);
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch (e) {}
        applyFullscreenMode(false);
        return;
    }

    // Fallback mode (Fullscreen API tidak ada): toggle pakai class saja.
    const overlay = document.getElementById('playerOverlay');
    if (!document.fullscreenElement && overlay && overlay.classList.contains('player-fullscreen-active')) {
        applyFullscreenMode(false);
        return;
    }

    // Prefer Fullscreen on the video element (mobile biasanya paling "langsung" dan bisa landscape).
    try {
        if (videoElement && videoElement.requestFullscreen) {
            const p = videoElement.requestFullscreen();
            if (p && typeof p.then === 'function') {
                p.then(() => applyFullscreenMode(true)).catch(() => applyFullscreenMode(true));
                return;
            }
            applyFullscreenMode(true);
            return;
        }

        if (videoElement && videoElement.webkitEnterFullscreen) {
            videoElement.webkitEnterFullscreen();
            applyFullscreenMode(true);
            return;
        }
    } catch (e) {}

    // Fallback kalau Fullscreen API tidak tersedia.
    applyFullscreenMode(true);
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
    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch (e) {}
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
        applyFullscreenMode(!!document.fullscreenElement);
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

    videoElement.addEventListener('timeupdate', () => {
        if (currentEpisode) {
            Storage.setProgress(currentEpisode.url, videoElement.currentTime);
        }
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

    const videoUrl = pickFromMap(sources, quality);
    const streamUrl = pickFromMap(streams, quality);

    if (videoUrl) {
        if (iframeElement) iframeElement.style.display = 'none';
        videoElement.style.display = '';
        videoElement.src = videoUrl;
        videoElement.load();
        videoElement.play().catch(() => {});
    } else if (streamUrl) {
        // Guard: jangan sampai kita embed "halaman episode asli" yang penuh UI.
        // Kalau ini kejadian, biasanya iframe akan tampil sebagai halaman website, bukan player stream.
        if (/\/episode\/\d+/.test(streamUrl) && /\/series\//.test(streamUrl)) {
            throw new Error('StreamUrl terdeteksi mengarah ke halaman episode (bukan media).');
        }
        videoElement.style.display = 'none';
        iframeElement.style.display = '';
        iframeElement.src = streamUrl;
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

    if (!episode && currentEpisodes.length > 0) {
        episode = currentEpisodes[0];
    }

    if (episode) {
        loadEpisode(episode);
    }

    renderEpisodeList(currentEpisodes, episode);

    document.getElementById('playerOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
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
        const res = await API.getVideoSources(episode.url);
        if (!res.success) {
            throw new Error(res.error || 'Tidak ada sumber');
        }

        currentMediaResponse = res;
        const qualities = getAvailableQualities(res.sources || {}, res.streams || {});
        const defaultQuality = res.default || '360p';
        const initialQuality = qualities.includes(defaultQuality) ? defaultQuality : (qualities[0] || defaultQuality);
        currentSelectedQuality = initialQuality;

        setQualityUI(initialQuality);
        renderQualityButtons(qualities, initialQuality);

        playCurrentEpisodeMediaByQuality(initialQuality);

        // Restore progress hanya untuk direct video (HTML5 <video>)
        if ((res.sources || {}) && (res.sources[initialQuality] || null) && videoElement) {
            const savedTime = Storage.getProgress(episode.url);
            if (savedTime) {
                videoElement.currentTime = savedTime;
            }
        }

        Storage.addWatchedEpisode(currentAnime.slug, episode.number);

    } catch (err) {
        console.error(err);
        UI.showNotification('Gagal memuat video. Coba episode lain.', 3000, 'error');
    } finally {
        UI.showLoading(false);
    }
}

function renderEpisodeList(episodes, activeEpisode) {
    const container = document.getElementById('episodeList');
    container.innerHTML = episodes.map(ep =>
        UI.renderEpisodeCard(ep, activeEpisode && ep.number === activeEpisode.number)
    ).join('');

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
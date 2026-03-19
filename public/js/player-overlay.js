let currentAnime = null;
let currentEpisodes = [];
let currentEpisode = null;
let videoElement = null;
let settings = { speed: 1.0 };

function closePlayer() {
    if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
    }
    document.getElementById('playerOverlay').style.display = 'none';
    document.body.style.overflow = 'auto';
}

document.addEventListener('DOMContentLoaded', () => {
    videoElement = document.getElementById('videoPlayer');
    if (!videoElement) return;

    settings = Storage.getSettings();
    videoElement.playbackRate = settings.speed;

    const closeBtn = document.querySelector('.close-player');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePlayer);
    }

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

window.openPlayer = function(anime, episode = null) {
    currentAnime = anime;
    currentEpisodes = anime.episodes || [];

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
        if (!res.success || !res.sources || Object.keys(res.sources).length === 0) {
            throw new Error('Tidak ada sumber video');
        }

        const sources = res.sources;
        const defaultQuality = res.default || Object.keys(sources)[0];
        const videoUrl = sources[defaultQuality];

        videoElement.src = videoUrl;
        videoElement.load();

        videoElement.play().catch(e => console.warn('Autoplay gagal:', e));

        Storage.addWatchedEpisode(currentAnime.slug, episode.number);

        const savedTime = Storage.getProgress(episode.url);
        if (savedTime) {
            videoElement.currentTime = savedTime;
        }
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
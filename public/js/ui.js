const UI = {
    showNotification(message, duration = 2000, type = 'info') {
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        Object.assign(notif.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-main))',
            backdropFilter: 'blur(10px)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '50px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            zIndex: '10000',
            borderLeft: `4px solid ${type === 'success' ? '#4caf92' : type === 'error' ? '#f44336' : 'var(--accent)'}`,
            animation: 'slideDown 0.3s ease',
            maxWidth: '90%',
            textAlign: 'center'
        });
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => notif.remove(), 300);
        }, duration);
    },

    showLoading(show, message = 'Loading...') {
        let loader = document.getElementById('global-loader');
        if (show) {
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'global-loader';
                Object.assign(loader.style, {
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: '9999'
                });
                loader.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:40px;color:var(--accent);"></i><p style="margin-top:16px;">${message}</p>`;
                document.body.appendChild(loader);
            }
        } else if (loader) {
            loader.remove();
        }
    },

    renderHorizontalCard(anime, type = 'continue') {
        if (type === 'continue') {
            const watchedEps = Storage.getWatchedEpisodes(anime.slug).length;
            const totalEps = anime.episodes?.length || 0;
            const t = Number(anime.lastProgressSeconds) || 0;
            const d = Number(anime.lastDurationSeconds) || 0;
            let progressPercent = 0;
            if (d > 0 && t >= 0) {
                progressPercent = Math.min(100, (t / d) * 100);
            } else if (totalEps > 0) {
                progressPercent = (watchedEps / totalEps) * 100;
            }
            const epLabel = anime.lastEpisodeNumber != null ? anime.lastEpisodeNumber : '?';
            const timeLabel = t > 0 ? Storage.formatTime(t) : '0:00';
            return `
                <div class="anime-card-wide ns-card ns-card-continue portrait" data-slug="${anime.slug}">
                    <div class="ns-card-poster">
                        <img src="${anime.image || 'https://via.placeholder.com/300x450'}" class="card-thumb" loading="lazy" alt="">
                        <div class="ns-card-shade"></div>
                        <div class="ns-card-play" aria-hidden="true"><span><i class="fas fa-play"></i></span></div>
                        <div class="ns-card-progress"><div class="ns-card-progress-fill" style="width: ${progressPercent}%;"></div></div>
                    </div>
                    <div class="ns-card-body">
                        <div class="card-title ns-card-title">${anime.title.replace(/"/g, '&quot;')}</div>
                        <div class="card-sub ns-card-sub">Eps ${epLabel} • ${timeLabel}</div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="anime-card-wide portrait ns-card" data-slug="${anime.slug}">
                    <div class="ns-card-poster">
                        <img src="${anime.image || 'https://via.placeholder.com/300x450'}" class="card-thumb" loading="lazy" alt="">
                        <div class="ns-card-shade"></div>
                        <div class="ns-card-play" aria-hidden="true"><span><i class="fas fa-play"></i></span></div>
                    </div>
                    <div class="ns-card-body">
                        <div class="card-title ns-card-title">${anime.title.replace(/"/g, '&quot;')}</div>
                        <div class="card-sub ns-card-sub">${anime.genre?.[0] || 'Anime'} • TV</div>
                    </div>
                </div>
            `;
        }
    },

    renderGridCard(anime, options = {}) {
        const showResume = options.showResume !== false && (anime.lastEpisodeNumber != null || (anime.lastProgressSeconds || 0) > 0);
        const resumeLine = showResume
            ? `<div class="anime-meta resume-line">Eps ${anime.lastEpisodeNumber != null ? anime.lastEpisodeNumber : '?'} • ${Storage.formatTime(anime.lastProgressSeconds || 0)}</div>`
            : '';
        return `
            <div class="anime-card" data-slug="${anime.slug}">
                <img src="${anime.image || 'https://via.placeholder.com/300x450'}" alt="${anime.title.replace(/"/g, '&quot;')}" loading="lazy">
                <div class="anime-info">
                    <h3>${anime.title.replace(/"/g, '&quot;')}</h3>
                    <div class="anime-meta">
                        <span>${anime.episodes?.length || '?'} eps</span>
                    </div>
                    ${resumeLine}
                </div>
            </div>
        `;
    },

    renderEpisodeCard(episode, isActive = false) {
        return `
            <div class="ep-card ${isActive ? 'active' : ''}" data-episode='${encodeURIComponent(JSON.stringify(episode))}'>
                Eps ${episode.number}
            </div>
        `;
    }
};
const Storage = {
    /** Format detik ke mm:ss atau h:mm:ss */
    formatTime(seconds) {
        const s = Math.max(0, Math.floor(Number(seconds) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
        return `${m}:${pad(sec)}`;
    },

    getHistoryEntry(slug) {
        return this.getHistory().find((h) => h.slug === slug) || null;
    },

    getEpisodeKey(episodeOrUrl, episodeNumber = null) {
        if (episodeOrUrl && typeof episodeOrUrl === 'object') {
            const url = String(episodeOrUrl.url || '').trim();
            const number = Number(episodeOrUrl.number);
            if (!url) return '';
            return Number.isFinite(number) ? `${url}::${number}` : url;
        }

        const url = String(episodeOrUrl || '').trim();
        const number = Number(episodeNumber);
        if (!url) return '';
        return Number.isFinite(number) ? `${url}::${number}` : url;
    },

    /**
     * Cari episode untuk resume dari entry history + objek anime (punya episodes[]).
     */
    findResumeEpisode(anime, historyEntry) {
        if (!anime || !anime.episodes || !historyEntry) return null;
        if (historyEntry.lastEpisodeKey) {
            const byKey = anime.episodes.find((e) => this.getEpisodeKey(e) === historyEntry.lastEpisodeKey);
            if (byKey) return byKey;
        }
        if (historyEntry.lastEpisodeUrl) {
            const byUrl = anime.episodes.find((e) => e.url === historyEntry.lastEpisodeUrl);
            if (byUrl) return byUrl;
        }
        if (historyEntry.lastEpisodeNumber != null) {
            const byNum = anime.episodes.find((e) => e.number === historyEntry.lastEpisodeNumber);
            if (byNum) return byNum;
        }
        return null;
    },

    /** Update posisi tontonan di history (tanpa mengubah urutan list). */
    updateHistoryWatchProgress(slug, patch) {
        if (!slug || !patch) return;
        const history = this.getHistory();
        const idx = history.findIndex((h) => h.slug === slug);
        if (idx === -1) return;
        const next = { ...history[idx], watchedAt: Date.now() };
        Object.keys(patch).forEach((k) => {
            const v = patch[k];
            if (v !== undefined) next[k] = v;
        });
        history[idx] = next;
        localStorage.setItem('history', JSON.stringify(history));
    },

    // ===== HISTORY =====
    getHistory() {
        return JSON.parse(localStorage.getItem('history') || '[]');
    },
    
    addToHistory(anime) {
        let history = this.getHistory();
        const existing = history.find((h) => h.slug === anime.slug);
        history = history.filter(h => h.slug !== anime.slug);
        history.unshift({
            ...anime,
            watchedAt: Date.now(),
            // Pertahankan progress resume kalau user buka anime yang sama lagi
            lastEpisodeKey: existing?.lastEpisodeKey,
            lastEpisodeNumber: existing?.lastEpisodeNumber,
            lastEpisodeUrl: existing?.lastEpisodeUrl,
            lastProgressSeconds: existing?.lastProgressSeconds,
            lastDurationSeconds: existing?.lastDurationSeconds,
        });
        history = history.slice(0, 50);
        localStorage.setItem('history', JSON.stringify(history));
    },
    
    clearHistory() {
        localStorage.setItem('history', '[]');
    },
    
    // ===== FAVORITES =====
    getFavorites() {
        return JSON.parse(localStorage.getItem('favorites') || '[]');
    },
    
    _normSlug(slug) {
        return String(slug == null ? '' : slug);
    },

    toggleFavorite(anime) {
        if (!anime || anime.slug == null || anime.slug === '') return false;
        const slug = this._normSlug(anime.slug);
        let favs = this.getFavorites();
        const exists = favs.some((f) => this._normSlug(f.slug) === slug);
        if (exists) {
            favs = favs.filter((f) => this._normSlug(f.slug) !== slug);
        } else {
            favs.unshift({ ...anime, slug, favoritedAt: Date.now() });
        }
        localStorage.setItem('favorites', JSON.stringify(favs));
        return !exists;
    },

    /** Hapus dari daftar tanpa perlu objek anime lengkap */
    removeFavorite(slug) {
        const s = this._normSlug(slug);
        if (!s) return;
        const favs = this.getFavorites().filter((f) => this._normSlug(f.slug) !== s);
        localStorage.setItem('favorites', JSON.stringify(favs));
    },

    isFavorite(slug) {
        const s = this._normSlug(slug);
        return this.getFavorites().some((f) => this._normSlug(f.slug) === s);
    },
    
    // ===== WATCHED EPISODES =====
    getWatchedEpisodes(animeSlug) {
        const key = `watched_${animeSlug}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    },
    
    addWatchedEpisode(animeSlug, episodeNum) {
        const key = `watched_${animeSlug}`;
        let watched = this.getWatchedEpisodes(animeSlug);
        if (!watched.includes(episodeNum)) {
            watched.push(episodeNum);
            localStorage.setItem(key, JSON.stringify(watched));
        }
    },
    
    // ===== PROGRESS =====
    getProgress(episodeOrUrl, episodeNumber = null) {
        const key = this.getEpisodeKey(episodeOrUrl, episodeNumber);
        return parseFloat(localStorage.getItem(`progress_${key}`)) || 0;
    },
    
    setProgress(episodeOrUrl, time, episodeNumber = null) {
        const key = this.getEpisodeKey(episodeOrUrl, episodeNumber);
        if (!key) return;
        localStorage.setItem(`progress_${key}`, time);
        this.cleanupProgress();
    },
    
    cleanupProgress() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('progress_'));
        if (keys.length > 200) {
            const toRemove = keys.slice(0, keys.length - 200);
            toRemove.forEach(k => localStorage.removeItem(k));
        }
    },
    
    // ===== SETTINGS =====
    getSettings() {
        return JSON.parse(localStorage.getItem('settings') || '{"speed":1.0,"quality":"auto"}');
    },
    
    saveSettings(settings) {
        localStorage.setItem('settings', JSON.stringify(settings));
    }
};

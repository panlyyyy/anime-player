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

    /**
     * Cari episode untuk resume dari entry history + objek anime (punya episodes[]).
     */
    findResumeEpisode(anime, historyEntry) {
        if (!anime || !anime.episodes || !historyEntry) return null;
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
    
    toggleFavorite(anime) {
        let favs = this.getFavorites();
        const exists = favs.some(f => f.slug === anime.slug);
        if (exists) {
            favs = favs.filter(f => f.slug !== anime.slug);
        } else {
            favs.unshift({ ...anime, favoritedAt: Date.now() });
        }
        localStorage.setItem('favorites', JSON.stringify(favs));
        return !exists;
    },
    
    isFavorite(slug) {
        return this.getFavorites().some(f => f.slug === slug);
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
    getProgress(episodeUrl) {
        return parseFloat(localStorage.getItem(`progress_${episodeUrl}`)) || 0;
    },
    
    setProgress(episodeUrl, time) {
        localStorage.setItem(`progress_${episodeUrl}`, time);
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
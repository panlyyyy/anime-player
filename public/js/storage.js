const Storage = {
    // ===== HISTORY =====
    getHistory() {
        return JSON.parse(localStorage.getItem('history') || '[]');
    },
    
    addToHistory(anime) {
        let history = this.getHistory();
        history = history.filter(h => h.slug !== anime.slug);
        history.unshift({ ...anime, watchedAt: Date.now() });
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
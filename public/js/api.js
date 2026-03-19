const API = {
    baseUrl: window.location.origin,
    
    async fetch(endpoint, params = {}) {
        const url = new URL(endpoint, this.baseUrl);
        Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
        const res = await fetch(url);
        return res.json();
    },
    
    async getAnimeList(page = 1, limit = 50) {
        return this.fetch('/api/anime', { page, limit });
    },
    
    async getDetail(slug) {
        return this.fetch('/api/detail', { slug });
    },
    
    async getVideoSources(episodeUrl) {
        return this.fetch('/api/episode', { url: episodeUrl });
    },
    
    async search(query) {
        return this.fetch('/api/search', { q: query });
    }
};
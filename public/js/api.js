const API = {
    baseUrl: window.location.origin,
    dataCache: null,

    async fetch(endpoint, params = {}) {
        const url = new URL(endpoint, this.baseUrl);
        Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        const contentType = res.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
            const body = await res.text();
            throw new Error(`Endpoint ${url.pathname} tidak mengembalikan JSON (${res.status}). ${body.slice(0, 120)}`);
        }

        const payload = await res.json();
        if (!res.ok) {
            throw new Error(payload?.error || `HTTP ${res.status}`);
        }

        return payload;
    },

    async loadStaticData() {
        if (this.dataCache) {
            return this.dataCache;
        }

        const res = await fetch('/data/anime_master.json', {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`Gagal memuat data statis (${res.status})`);
        }

        const payload = await res.json();
        this.dataCache = Array.isArray(payload?.data) ? payload.data : [];
        return this.dataCache;
    },

    async getAnimeList(page = 1, limit = 50) {
        try {
            return await this.fetch('/api/anime', { page, limit });
        } catch (error) {
            console.warn('API anime gagal, fallback ke data statis:', error);
            const data = await this.loadStaticData();
            const safePage = Number(page) || 1;
            const safeLimit = Number(limit) || 50;
            const start = (safePage - 1) * safeLimit;
            const end = start + safeLimit;

            return {
                success: true,
                data: data.slice(start, end),
                total: data.length,
                page: safePage,
                limit: safeLimit,
                fallback: 'static'
            };
        }
    },

    async getDetail(slug) {
        try {
            return await this.fetch('/api/detail', { slug });
        } catch (error) {
            console.warn('API detail gagal, fallback ke data statis:', error);
            const data = await this.loadStaticData();
            const anime = data.find(item => item.slug === slug);

            if (!anime) {
                return {
                    success: false,
                    error: 'Not found'
                };
            }

            return {
                success: true,
                data: anime,
                fallback: 'static'
            };
        }
    },

    async getVideoSources(episodeUrl) {
        try {
            return await this.fetch('/api/episode', { url: episodeUrl });
        } catch (error) {
            console.warn('API episode gagal, fallback ke data statis:', error);
            const data = await this.loadStaticData();

            for (const anime of data) {
                const episode = (anime.episodes || []).find(item => item.url === episodeUrl);
                if (episode) {
                    return {
                        success: true,
                        sources: episode.sources || {},
                        streams: {},
                        default: episode.default || '360p',
                        url: episodeUrl,
                        fallback: 'static'
                    };
                }
            }

            return {
                success: false,
                error: 'Episode not found'
            };
        }
    },

    async search(query) {
        try {
            return await this.fetch('/api/search', { q: query });
        } catch (error) {
            console.warn('API search gagal, fallback ke data statis:', error);
            const keyword = String(query || '').trim().toLowerCase();
            if (!keyword) {
                return {
                    success: true,
                    data: [],
                    total: 0,
                    fallback: 'static'
                };
            }

            const data = await this.loadStaticData();
            const results = data.filter(item => (item.title_lower || item.title || '').toLowerCase().includes(keyword));

            return {
                success: true,
                data: results,
                total: results.length,
                fallback: 'static'
            };
        }
    }
};

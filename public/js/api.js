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
            const message = typeof payload?.error === 'string'
                ? payload.error
                : JSON.stringify(payload?.error || payload);
            throw new Error(message || `HTTP ${res.status}`);
        }

        return payload;
    },

    async getSearchSuggestions(query, limit = 8) {
        const q = String(query || '').trim().toLowerCase();
        if (!q || q.length < 2) return [];
        const data = await this.loadStaticData();
        const matches = data
            .filter(a => (a.title_lower || a.title || '').toLowerCase().includes(q))
            .slice(0, limit)
            .map(a => ({ title: a.title, slug: a.slug, image: a.image }));
        return matches;
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

    getEpisodeCount(anime) {
        return Array.isArray(anime?.episodes) ? anime.episodes.length : 0;
    },

    hasPlayableMedia(anime) {
        return this.getEpisodeCount(anime) > 0 || !!anime?.trailer;
    },

    isDisplayableAnime(anime) {
        if (!anime || !anime.slug || !anime.title) {
            return false;
        }

        return Boolean(
            anime.image ||
            anime.synopsis ||
            anime.description ||
            this.getEpisodeCount(anime) > 0 ||
            anime.trailer ||
            (Array.isArray(anime.genre) && anime.genre.length > 0) ||
            anime.score
        );
    },

    filterAnime(list = [], filters = {}) {
        let filtered = Array.isArray(list) ? [...list] : [];
        if (filters.genre) filtered = filtered.filter((a) => (a.genre || []).includes(filters.genre));
        if (filters.status) filtered = filtered.filter((a) => (a.status || '').trim() === filters.status);
        if (filters.type) filtered = filtered.filter((a) => (a.type || '').trim() === filters.type);
        if (filters.q) {
            const q = String(filters.q || '').trim().toLowerCase();
            filtered = filtered.filter((a) => (a.title_lower || a.title || '').toLowerCase().includes(q));
        }
        return filtered;
    },

    getAnimeRankScore(anime) {
        const rawScore = parseFloat(anime?.score ?? anime?.rating);
        const score = Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 10 ? rawScore : 0;
        const episodeCount = this.getEpisodeCount(anime);
        const genreCount = Array.isArray(anime?.genre) ? anime.genre.length : 0;
        const hasTrailer = anime?.trailer ? 1 : 0;
        const isCompleted = String(anime?.status || '').toLowerCase().includes('completed') ? 1 : 0;
        const mediaBonus = episodeCount > 0 ? 400 : (hasTrailer ? 150 : -500);
        return (score * 1000) + mediaBonus + (Math.min(episodeCount, 60) * 3) + genreCount + (hasTrailer * 2) + isCompleted;
    },

    sortAnimeByRanking(list = []) {
        return [...list].sort((a, b) => {
            const rankDiff = this.getAnimeRankScore(b) - this.getAnimeRankScore(a);
            if (rankDiff !== 0) return rankDiff;

            const rawScoreA = parseFloat(a?.score ?? a?.rating);
            const rawScoreB = parseFloat(b?.score ?? b?.rating);
            const safeScoreA = Number.isFinite(rawScoreA) && rawScoreA >= 0 && rawScoreA <= 10 ? rawScoreA : 0;
            const safeScoreB = Number.isFinite(rawScoreB) && rawScoreB >= 0 && rawScoreB <= 10 ? rawScoreB : 0;
            const scoreDiff = safeScoreB - safeScoreA;
            if (scoreDiff !== 0) return scoreDiff;

            const playableDiff = Number(this.hasPlayableMedia(b)) - Number(this.hasPlayableMedia(a));
            if (playableDiff !== 0) return playableDiff;

            const episodeDiff = this.getEpisodeCount(b) - this.getEpisodeCount(a);
            if (episodeDiff !== 0) return episodeDiff;

            return String(a?.title || '').localeCompare(String(b?.title || ''), 'id');
        });
    },

    async getFilters() {
        try {
            const payload = await this.fetch('/api/filters');
            if (payload?.success && payload?.data) return payload.data;
        } catch (e) {
            console.warn('API filters gagal, pakai default');
        }
        return { genres: [], statuses: ['Ongoing', 'Completed'], types: ['Serial TV', 'Movie', 'OVA'] };
    },

    async getAnimeList(page = 1, limit = 50, filters = {}) {
        try {
            const params = { page, limit };
            if (filters.genre) params.genre = filters.genre;
            if (filters.status) params.status = filters.status;
            if (filters.type) params.type = filters.type;
            if (filters.q) params.q = filters.q;
            const payload = await this.fetch('/api/anime', params);

            // Skenario tertentu bisa bikin endpoint sukses tapi isi data kosong (contoh:
            // file anime_master.json tidak ikut ke runtime serverless).
            // Jangan biarkan UI blank; fallback ke data statis.
            if (
                payload?.success === true &&
                Array.isArray(payload?.data) &&
                payload.data.length === 0 &&
                Number(payload?.total || 0) === 0
            ) {
                return this._fallbackAnimeList(page, limit, filters);
            }

            return payload;
        } catch (error) {
            console.warn('API anime gagal, fallback ke data statis:', error);
            return this._fallbackAnimeList(page, limit, filters);
        }
    },

    _fallbackAnimeList(page, limit, filters = {}) {
        return this.loadStaticData().then(data => {
            const filtered = this.sortAnimeByRanking(this.filterAnime(
                data.filter((anime) => this.isDisplayableAnime(anime)),
                filters
            ));
            const safePage = Number(page) || 1;
            const safeLimit = Number(limit) || 50;
            const start = (safePage - 1) * safeLimit;
            const end = start + safeLimit;
            return { success: true, data: filtered.slice(start, end), total: filtered.length, page: safePage, limit: safeLimit, fallback: 'static' };
        });
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

    async getVideoSources(episodeUrl, episodeNumber = null) {
        try {
            const params = { url: episodeUrl };
            if (episodeNumber != null) params.number = episodeNumber;
            return await this.fetch('/api/episode', params);
        } catch (error) {
            console.warn('API episode gagal, fallback ke data statis:', error);
            const data = await this.loadStaticData();

            for (const anime of data) {
                const episode = (anime.episodes || []).find(item =>
                    item.url === episodeUrl &&
                    (episodeNumber == null || Number(item.number) === Number(episodeNumber))
                );
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

    async search(query, filters = {}) {
        try {
            const params = { q: query || '' };
            if (filters.genre) params.genre = filters.genre;
            if (filters.status) params.status = filters.status;
            if (filters.type) params.type = filters.type;
            const payload = await this.fetch('/api/search', params);

            if (
                payload?.success === true &&
                Array.isArray(payload?.data) &&
                payload.data.length === 0 &&
                Number(payload?.total || 0) === 0
            ) {
                return this._fallbackSearch(query, filters);
            }

            return payload;
        } catch (error) {
            console.warn('API search gagal, fallback ke data statis:', error);
            return this._fallbackSearch(query, filters);
        }
    },

    _fallbackSearch(query, filters = {}) {
        const keyword = String(query || '').trim().toLowerCase();
        return this.loadStaticData().then(data => {
            const source = data.filter((anime) => this.isDisplayableAnime(anime));
            const seeded = keyword ? source.filter(item => (item.title_lower || item.title || '').toLowerCase().includes(keyword)) : source;
            const results = this.sortAnimeByRanking(this.filterAnime(seeded, filters));
            return { success: true, data: results, total: results.length, fallback: 'static' };
        });
    }
};

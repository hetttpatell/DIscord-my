/**
 * Server-side YouTube Search & URL Resolution Service
 * - URL parsing for youtube.com, youtu.be, music.youtube.com, and shorts
 * - Single-track resolution via videos.list / oEmbed (1 unit or 0 units)
 * - YouTube Data API v3 search with videoEmbeddable=true & videoSyndicated=true (100 units)
 * - 10-minute in-memory query cache
 * - Client-based rate limiting
 * - Structured error mapping (QUOTA_EXCEEDED, INVALID_KEY, NETWORK_ERROR, INVALID_QUERY)
 */

export const YOUTUBE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const SEARCH_RATE_LIMIT_MAX = 15; // max 15 searches per client per minute
export const SEARCH_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

export class YouTubeSearchService {
  constructor({ apiKey = null, fetchFn = globalThis.fetch } = {}) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
    this.cache = new Map(); // query -> { timestamp, items }
    this.rateLimits = new Map(); // clientId -> Array<number> (timestamps)
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  /**
   * Extract YouTube 11-character video ID from any standard or mobile URL
   */
  static extractVideoId(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();

    // 1. URL pattern matching standard, short, music, and shorts domains
    const regex = /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?.*?v=|embed\/|v\/|shorts\/))([\w-]{11})/;
    const match = clean.match(regex);
    if (match && match[1]) {
      return match[1];
    }

    // 2. Direct 11-character ID (must not contain slashes, spaces, or query markers)
    if (/^[\w-]{11}$/.test(clean)) {
      return clean;
    }

    return null;
  }

  /**
   * Check client rate limits (sliding 1-minute window)
   */
  checkRateLimit(clientId, now = Date.now()) {
    if (!clientId) return { limited: false };
    const history = this.rateLimits.get(clientId) || [];
    const validHistory = history.filter(ts => now - ts < SEARCH_RATE_LIMIT_WINDOW_MS);
    this.rateLimits.set(clientId, validHistory);

    if (validHistory.length >= SEARCH_RATE_LIMIT_MAX) {
      return { limited: true, retryAfterSeconds: Math.ceil((SEARCH_RATE_LIMIT_WINDOW_MS - (now - validHistory[0])) / 1000) };
    }

    validHistory.push(now);
    this.rateLimits.set(clientId, validHistory);
    return { limited: false };
  }

  /**
   * Fetch single video details by video ID (costs 1 unit on API, 0 on oEmbed)
   */
  async fetchVideoById(videoId) {
    const key = this.apiKey || process.env.YOUTUBE_API_KEY;

    // Try YouTube Data API videos.list if API key is configured
    if (key) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
        const res = await this.fetchFn(url);
        const data = await res.json();

        if (res.ok && data.items && data.items.length > 0) {
          const item = data.items[0];
          return [{
            id: videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            source: 'direct-video'
          }];
        }
      } catch {
        console.warn('[YouTubeSearchService] videos.list failed, trying oembed fallback:', err.message);
      }
    }

    // Zero-quota fallback: YouTube oEmbed
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
      const res = await this.fetchFn(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        return [{
          id: videoId,
          title: data.title || `YouTube Video (${videoId})`,
          channelTitle: data.author_name || 'YouTube Creator',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          source: 'oembed'
        }];
      }
    } catch {
      // Fallback object with standard thumbnail
    }

    return [{
      id: videoId,
      title: `YouTube Video (${videoId})`,
      channelTitle: 'YouTube',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      source: 'fallback'
    }];
  }

  /**
   * Search YouTube or resolve pasted URL with caching & error mapping
   */
  async search({ query, clientId = null, now = Date.now() }) {
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return {
        error: 'INVALID_QUERY',
        message: 'Search query must be at least 2 characters.',
        items: []
      };
    }

    const trimmedQuery = query.trim();

    // 1. Direct URL or Video ID pasted -> 1 unit or 0 quota units
    const directVideoId = YouTubeSearchService.extractVideoId(trimmedQuery);
    if (directVideoId) {
      const items = await this.fetchVideoById(directVideoId);
      return { items, cached: false, isDirect: true };
    }

    // 2. Check rate limit
    if (clientId) {
      const rateStatus = this.checkRateLimit(clientId, now);
      if (rateStatus.limited) {
        return {
          error: 'RATE_LIMITED',
          message: `Too many searches. Please wait ${rateStatus.retryAfterSeconds} seconds before searching again.`,
          items: []
        };
      }
    }

    // 3. Cache Check (10-minute in-memory cache)
    const normalizedKey = trimmedQuery.toLowerCase();
    const cached = this.cache.get(normalizedKey);
    if (cached && (now - cached.timestamp < YOUTUBE_CACHE_TTL_MS)) {
      return { items: cached.items, cached: true };
    }

    const key = this.apiKey || process.env.YOUTUBE_API_KEY;
    if (!key) {
      return {
        error: 'NO_API_KEY',
        message: 'Search requires YouTube API key. You can paste any YouTube link directly to play it!',
        items: []
      };
    }

    // 4. YouTube Data API v3 Search (Embeddable + Syndicated filters)
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(trimmedQuery)}&type=video&videoEmbeddable=true&videoSyndicated=true&key=${encodeURIComponent(key)}`;
      const response = await this.fetchFn(searchUrl);
      const data = await response.json();

      if (!response.ok || data.error) {
        const errorReason = data.error?.errors?.[0]?.reason || '';
        const errorCode = data.error?.code;

        if (errorCode === 403 && (errorReason === 'quotaExceeded' || errorReason === 'rateLimitExceeded')) {
          return {
            error: 'QUOTA_EXCEEDED',
            message: 'YouTube daily search quota reached. You can still paste YouTube links directly to play any video!',
            items: []
          };
        }

        if (errorCode === 400 && (errorReason === 'keyInvalid' || errorReason === 'badRequest')) {
          return {
            error: 'INVALID_KEY',
            message: 'YouTube API key is invalid or restricted. You can paste YouTube links directly to play!',
            items: []
          };
        }

        return {
          error: 'API_ERROR',
          message: data.error?.message || 'Failed to search YouTube.',
          items: []
        };
      }

      const items = (data.items || []).map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt
      }));

      // Cache search results for 10 minutes
      this.cache.set(normalizedKey, { timestamp: now, items });

      return { items, cached: false };
    } catch {
      return {
        error: 'NETWORK_ERROR',
        message: 'Network error connecting to YouTube. Please check your connection or paste a link.',
        items: []
      };
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export const youtubeSearchService = new YouTubeSearchService();

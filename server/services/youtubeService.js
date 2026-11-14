import { LRUCache } from 'lru-cache';
import { config } from '../config.js';

export const searchCache = new LRUCache({
  max: 500,
  ttl: 10 * 60 * 1000, // 10 minutes
});

/**
 * Parse ISO 8601 duration (e.g. PT4M13S, PT1H20S) to total seconds
 */
export function parseIsoDuration(duration) {
  if (!duration || typeof duration !== 'string') return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export async function searchYouTube(query, apiKey = config.YOUTUBE_API_KEY) {
  const cleanQuery = (query || '').trim().toLowerCase();
  if (!cleanQuery) return [];

  const cached = searchCache.get(cleanQuery);
  if (cached) {
    return cached;
  }

  if (!apiKey) {
    const err = new Error('YouTube API key is not configured on the server');
    err.status = 500;
    throw err;
  }

  // 1. search.list: type=video, videoEmbeddable=true, maxResults=15, part=snippet
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoEmbeddable', 'true');
  searchUrl.searchParams.set('maxResults', '15');
  searchUrl.searchParams.set('q', cleanQuery);
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const errorBody = await searchRes.json().catch(() => ({}));
    const message =
      errorBody?.error?.message || `YouTube API search failed with status ${searchRes.status}`;
    const err = new Error(message);
    err.status = searchRes.status === 403 ? 429 : searchRes.status;
    throw err;
  }

  const searchData = await searchRes.json();
  const items = searchData.items || [];
  if (items.length === 0) {
    searchCache.set(cleanQuery, []);
    return [];
  }

  const videoIds = items.map((it) => it.id?.videoId).filter(Boolean);
  if (videoIds.length === 0) {
    searchCache.set(cleanQuery, []);
    return [];
  }

  // 2. videos.list for durations
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.searchParams.set('part', 'contentDetails');
  videosUrl.searchParams.set('id', videoIds.join(','));
  videosUrl.searchParams.set('key', apiKey);

  const videosRes = await fetch(videosUrl.toString());
  const durationsMap = new Map();
  if (videosRes.ok) {
    const videosData = await videosRes.json();
    for (const v of videosData.items || []) {
      const durationSec = parseIsoDuration(v.contentDetails?.duration);
      durationsMap.set(v.id, durationSec);
    }
  }

  // 3. Map to exact schema: { videoId, title, channel, thumbnailUrl, durationSec }
  const results = items
    .filter((it) => it.id?.videoId)
    .map((it) => {
      const vid = it.id.videoId;
      const snippet = it.snippet || {};
      const thumbnails = snippet.thumbnails || {};
      const thumb =
        thumbnails.high?.url ||
        thumbnails.medium?.url ||
        thumbnails.default?.url ||
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

      return {
        videoId: vid,
        title: snippet.title || 'Untitled',
        channel: snippet.channelTitle || 'Unknown Channel',
        thumbnailUrl: thumb,
        durationSec: durationsMap.get(vid) || 0,
      };
    });

  searchCache.set(cleanQuery, results);
  return results;
}


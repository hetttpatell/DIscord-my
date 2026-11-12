// Helper functions for YouTube integration and default curated tracks
import { getBackendUrl } from './socket';

export const CURATED_TRACKS = [
  {
    id: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    channelTitle: 'Lofi Girl',
    thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    category: 'Lo-Fi Chill'
  },
  {
    id: '4xDzrJKXOOY',
    title: 'synthwave radio - chill synth / retro beats',
    channelTitle: 'Lofi Girl',
    thumbnail: 'https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    category: 'Synthwave'
  },
  {
    id: '5yx6BWlEVcY',
    title: 'Chillhop Radio - jazzy & lofi hip hop beats',
    channelTitle: 'Chillhop Music',
    thumbnail: 'https://img.youtube.com/vi/5yx6BWlEVcY/hqdefault.jpg',
    category: 'Chillhop'
  },
  {
    id: 'fKopy74weus',
    title: 'Imagine Dragons - Radioactive',
    channelTitle: 'ImagineDragonsVEVO',
    thumbnail: 'https://img.youtube.com/vi/fKopy74weus/hqdefault.jpg',
    category: 'Rock / Pop'
  },
  {
    id: 'kJQP7kiw5Fk',
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
    channelTitle: 'Luis Fonsi',
    thumbnail: 'https://img.youtube.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    category: 'Pop'
  },
  {
    id: 'hT_nvWreIhg',
    title: 'OneRepublic - Counting Stars',
    channelTitle: 'OneRepublic',
    thumbnail: 'https://img.youtube.com/vi/hT_nvWreIhg/hqdefault.jpg',
    category: 'Pop'
  },
  {
    id: '2Vv-BfVoq4g',
    title: 'Ed Sheeran - Perfect',
    channelTitle: 'Ed Sheeran',
    thumbnail: 'https://img.youtube.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
    category: 'Acoustic'
  },
  {
    id: 'JGwWNGJdvx8',
    title: 'Ed Sheeran - Shape of You',
    channelTitle: 'Ed Sheeran',
    thumbnail: 'https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    category: 'Pop'
  }
];

/**
 * Decode HTML entities in YouTube titles (e.g. &amp; &#39; &quot;)
 */
export function decodeHtmlEntities(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Extracts YouTube Video ID from various URL formats or raw ID
 */
export function extractYouTubeId(input) {
  if (!input) return null;
  const cleanInput = input.trim();

  // 1. Regex for youtube.com, youtu.be, youtube.com/shorts, etc.
  const urlRegex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/;
  const urlMatch = cleanInput.match(urlRegex);
  if (urlMatch) return urlMatch[1];

  // 2. If it's a strict 11-char ID that has numbers, upper, lower, or symbols typical of YouTube video IDs
  // and has no whitespace
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanInput) && /[0-9_-]/.test(cleanInput) && /[A-Z]/.test(cleanInput) && /[a-z]/.test(cleanInput)) {
    return cleanInput;
  }

  return null;
}

/**
 * Fetch video metadata via backend oEmbed proxy or direct oEmbed
 */
export async function fetchVideoDetails(videoIdOrUrl) {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL or Video ID');
  }

  try {
    const response = await fetch(`/api/youtube/oembed?videoId=${videoId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      id: videoId,
      title: decodeHtmlEntities(data.title || `YouTube Video (${videoId})`),
      channelTitle: data.channelTitle || 'YouTube Creator',
      thumbnail: data.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0
    };
  } catch (error) {
    return {
      id: videoId,
      title: `YouTube Video (${videoId})`,
      channelTitle: 'YouTube',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0
    };
  }
}

/**
 * Search YouTube using backend proxy or direct YouTube Data API v3
 */
export async function searchYouTube(query, apiKey) {
  if (!query?.trim()) return [];

  const cleanQuery = query.trim();
  const cleanKey = apiKey?.trim();

  // 1. Try Backend search endpoint first (it has the key from .env or query param)
  try {
    const params = new URLSearchParams({ q: cleanQuery });
    if (cleanKey && cleanKey !== 'CONFIGURED_ON_SERVER') {
      params.append('key', cleanKey);
    }

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/youtube/search?${params.toString()}`);
    const data = await response.json();

    if (response.ok && data.items && data.items.length > 0) {
      return data.items.map(item => ({
        ...item,
        title: decodeHtmlEntities(item.title)
      }));
    }

    if (data.error) {
      console.warn('Backend YouTube search returned error:', data.error);
    }
  } catch (err) {
    console.warn('Backend search request failed, checking direct API:', err);
  }

  // 2. If client has an explicit key, attempt direct Google API call
  if (cleanKey && cleanKey !== 'CONFIGURED_ON_SERVER') {
    try {
      const directUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(cleanQuery)}&type=video&key=${encodeURIComponent(cleanKey)}`;
      const res = await fetch(directUrl);
      const json = await res.json();
      if (res.ok && json.items) {
        return json.items.map(item => ({
          id: item.id.videoId,
          title: decodeHtmlEntities(item.snippet.title),
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
        }));
      }
    } catch (e) {
      console.warn('Direct Google search failed:', e);
    }
  }

  // 3. Fallback: Search curated tracks
  const lowerQuery = cleanQuery.toLowerCase();
  const matched = CURATED_TRACKS.filter(t =>
    t.title.toLowerCase().includes(lowerQuery) ||
    t.channelTitle.toLowerCase().includes(lowerQuery) ||
    t.category.toLowerCase().includes(lowerQuery)
  );

  return matched;
}

/**
 * Format seconds to mm:ss or hh:mm:ss
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

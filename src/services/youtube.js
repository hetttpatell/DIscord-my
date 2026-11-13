// Helper functions for YouTube integration, search, and formatting
import { getBackendUrl } from './socket';
import { getClientId } from './clientId';

/**
 * Decode HTML entities in YouTube titles (e.g. &amp; &#39; &quot;)
 */
export function decodeHtmlEntities(str) {
  if (!str) return '';
  if (typeof document === 'undefined') return str;
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Extracts YouTube Video ID from various URL formats or raw 11-character ID
 */
export function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();

  const regex = /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?.*?v=|embed\/|v\/|shorts\/))([\w-]{11})/;
  const match = clean.match(regex);
  if (match && match[1]) {
    return match[1];
  }

  if (/^[\w-]{11}$/.test(clean)) {
    return clean;
  }

  return null;
}

/**
 * Search YouTube using backend proxy with caching, rate limiting, and structured error mapping
 */
export async function searchYouTube(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return {
      error: 'INVALID_QUERY',
      message: 'Please enter at least 2 characters to search.',
      items: []
    };
  }

  const cleanQuery = query.trim();
  const clientId = getClientId();

  try {
    const params = new URLSearchParams({
      q: cleanQuery,
      clientId
    });

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/youtube/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        error: data.error || 'SEARCH_ERROR',
        message: data.message || 'Unable to load YouTube results.',
        items: []
      };
    }

    const items = (data.items || []).map(item => ({
      ...item,
      title: decodeHtmlEntities(item.title)
    }));

    return {
      items,
      error: null,
      message: items.length === 0 ? 'No matching videos found.' : null
    };
  } catch {
    return {
      error: 'NETWORK_ERROR',
      message: 'Network error connecting to YouTube. Please check your connection.',
      items: []
    };
  }
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

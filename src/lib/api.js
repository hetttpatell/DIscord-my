export function getBackendUrl() {
  const rawBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.API_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.BACKEND_URL ||
    '';

  if (!rawBase) return '';

  // If accessed from a mobile device or other machine on the same LAN, resolve localhost to actual host
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    try {
      const parsed = new URL(rawBase);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = window.location.hostname;
        return parsed.origin;
      }
    } catch {
      // ignore
    }
  }

  return rawBase.replace(/\/+$/, '');
}

export async function apiRequest(endpoint, { method = 'GET', body, token, signal } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const base = getBackendUrl();
  const url = `${base}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg =
      (isJson && data?.error) || (isJson && data?.message) || response.statusText || 'Request failed';
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}


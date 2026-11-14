const rawBase =
  import.meta.env.VITE_API_URL ||
  import.meta.env.API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.BACKEND_URL ||
  '';
const API_BASE = rawBase ? rawBase.replace(/\/+$/, '') : '';

export async function apiRequest(endpoint, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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


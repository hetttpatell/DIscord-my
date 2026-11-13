import { io } from 'socket.io-client';

// Determine backend URL from VITE_BACKEND_URL or current origin (proxied in dev, direct in prod)
export function getBackendUrl() {
  // In dev, connect same-origin through Vite's HTTPS dev proxy to eliminate mixed-content errors
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
  }

  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3001';
}

export const BACKEND_URL = getBackendUrl();

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  timeout: 10000
});

export default socket;


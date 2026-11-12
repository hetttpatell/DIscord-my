import { io } from 'socket.io-client';

// Connect to backend (via Vite proxy in dev or direct server)
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/';

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export default socket;


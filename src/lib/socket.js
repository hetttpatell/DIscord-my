import { io } from 'socket.io-client';
import { getBackendUrl } from './api';

let activeSocket = null;

export const getSocket = (token) => {
  const backendUrl = getBackendUrl();

  if (activeSocket) {
    if (token && activeSocket.auth?.token !== token) {
      activeSocket.auth = { token };
      if (activeSocket.connected) {
        activeSocket.disconnect();
      }
      activeSocket.connect();
    } else if (!activeSocket.connected && !activeSocket.connecting) {
      activeSocket.connect();
    }
    return activeSocket;
  }

  activeSocket = io(backendUrl || undefined, {
    autoConnect: false,
    auth: {
      token,
    },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
  });

  return activeSocket;
};

export const disconnectSocket = () => {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }
};

export const createSocket = getSocket;
export default getSocket;

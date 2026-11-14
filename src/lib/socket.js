import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '';

let activeSocket = null;

export const getSocket = (token) => {
  if (activeSocket) {
    if (token && activeSocket.auth?.token !== token) {
      activeSocket.auth = { token };
      if (activeSocket.connected) {
        activeSocket.disconnect().connect();
      }
    }
    return activeSocket;
  }

  activeSocket = io(API_URL || undefined, {
    autoConnect: false,
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
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

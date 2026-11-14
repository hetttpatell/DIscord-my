import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '';

export const createSocket = (token) => {
  return io(API_URL || undefined, {
    autoConnect: false,
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
  });
};

export default createSocket;


import { create } from 'zustand';

export const useAppStore = create((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('afterspot_token') || null : null,
  roomId: typeof window !== 'undefined' ? localStorage.getItem('afterspot_roomId') || null : null,
  memberId: typeof window !== 'undefined' ? localStorage.getItem('afterspot_memberId') || null : null,
  displayName: typeof window !== 'undefined' ? localStorage.getItem('afterspot_displayName') || '' : '',
  members: [],
  playerState: {
    videoId: '',
    status: 'paused',
    positionSec: 0,
    serverUpdatedAtMs: 0,
  },
  serverOffsetMs: 0,
  setSession: ({ token, roomId, memberId, displayName }) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('afterspot_token', token);
      else localStorage.removeItem('afterspot_token');
      if (roomId) localStorage.setItem('afterspot_roomId', roomId);
      else localStorage.removeItem('afterspot_roomId');
      if (memberId) localStorage.setItem('afterspot_memberId', memberId);
      else localStorage.removeItem('afterspot_memberId');
      if (displayName) localStorage.setItem('afterspot_displayName', displayName);
      else localStorage.removeItem('afterspot_displayName');
    }
    set({ token, roomId, memberId, displayName });
  },
  clearSession: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('afterspot_token');
      localStorage.removeItem('afterspot_roomId');
      localStorage.removeItem('afterspot_memberId');
      localStorage.removeItem('afterspot_displayName');
    }
    set({
      token: null,
      roomId: null,
      memberId: null,
      displayName: '',
      members: [],
      playerState: {
        videoId: '',
        status: 'paused',
        positionSec: 0,
        serverUpdatedAtMs: 0,
      },
    });
  },
  setMembers: (members) => set({ members }),
  setPlayerState: (playerState) =>
    set((prev) => ({ playerState: { ...prev.playerState, ...playerState } })),
  setServerOffsetMs: (offset) => set({ serverOffsetMs: offset }),
}));


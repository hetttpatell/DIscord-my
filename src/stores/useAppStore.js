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
  queue: [],
  nowPlaying: null,
  queueVersion: 0,
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
    set({
      token,
      roomId,
      memberId,
      displayName,
      queue: [],
      nowPlaying: null,
      queueVersion: 0,
    });
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
      queue: [],
      nowPlaying: null,
      queueVersion: 0,
    });
  },
  setMembers: (members) => {
    let list = [];
    if (Array.isArray(members)) {
      list = members;
    } else if (members && Array.isArray(members.members)) {
      list = members.members;
    } else if (members && typeof members === 'object') {
      list = Object.values(members);
    }
    set({ members: list });
  },
  setQueueUpdate: ({ queue, nowPlaying, version }) =>
    set((state) => {
      // Reject only if incoming version is strictly smaller than an active version > 1
      if (
        typeof version === 'number' &&
        typeof state.queueVersion === 'number' &&
        state.queueVersion > 1 &&
        version > 0 &&
        version < state.queueVersion
      ) {
        return state;
      }
      return {
        queue: Array.isArray(queue) ? queue : [],
        nowPlaying: nowPlaying !== undefined ? nowPlaying : state.nowPlaying,
        queueVersion: typeof version === 'number' ? version : state.queueVersion,
      };
    }),
  setPlayerState: (playerState) =>
    set((prev) => {
      const next = { ...prev.playerState, ...playerState };
      if (typeof window !== 'undefined') {
        window.__afterspot_playerState = next;
      }
      return { playerState: next };
    }),
  setServerOffsetMs: (offset) => set({ serverOffsetMs: offset }),
}));


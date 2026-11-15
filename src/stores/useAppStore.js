import { create } from 'zustand';

export const useAppStore = create((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('afterspot_token') || null : null,
  roomId: typeof window !== 'undefined' ? localStorage.getItem('afterspot_roomId') || null : null,
  memberId: typeof window !== 'undefined' ? localStorage.getItem('afterspot_memberId') || null : null,
  displayName:
    typeof window !== 'undefined'
      ? localStorage.getItem('afterspot:name') || localStorage.getItem('afterspot_displayName') || ''
      : '',
  peerId: '',
  members: [],
  memberVersion: 0,
  playerState: {
    videoId: '',
    status: 'paused',
    positionSec: 0,
    serverUpdatedAtMs: 0,
  },
  serverOffsetMs: 0,
  queue: [],
  nowPlaying: null,
  queueVersion: 0,
  skipVotes: { votes: 0, needed: 1 },
  chatMessages: [],
  unreadChatCount: 0,
  speakingMembers: {},
  recentSocketEvents: [],
  peerDebugStats: {
    peerId: '',
    calls: [],
    senders: [],
  },

  setSession: ({ token, roomId, memberId, displayName }) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('afterspot_token', token);
      else localStorage.removeItem('afterspot_token');
      if (roomId) localStorage.setItem('afterspot_roomId', roomId);
      else localStorage.removeItem('afterspot_roomId');
      if (memberId) localStorage.setItem('afterspot_memberId', memberId);
      else localStorage.removeItem('afterspot_memberId');
      if (displayName) {
        localStorage.setItem('afterspot:name', displayName);
        localStorage.setItem('afterspot_displayName', displayName);
      } else {
        localStorage.removeItem('afterspot:name');
        localStorage.removeItem('afterspot_displayName');
      }
    }
    set({ token, roomId, memberId, displayName });
  },

  clearSession: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('afterspot_token');
      localStorage.removeItem('afterspot_roomId');
      localStorage.removeItem('afterspot_memberId');
      localStorage.removeItem('afterspot:name');
      localStorage.removeItem('afterspot_displayName');
    }
    set({
      token: null,
      roomId: null,
      memberId: null,
      displayName: '',
      peerId: '',
      members: [],
      memberVersion: 0,
      playerState: {
        videoId: '',
        status: 'paused',
        positionSec: 0,
        serverUpdatedAtMs: 0,
      },
      queue: [],
      nowPlaying: null,
      queueVersion: 0,
      skipVotes: { votes: 0, needed: 1 },
      chatMessages: [],
      unreadChatCount: 0,
      speakingMembers: {},
      recentSocketEvents: [],
      peerDebugStats: { peerId: '', calls: [], senders: [] },
    });
  },

  setPeerId: (peerId) => set({ peerId }),

  setMembersWithVersion: (payload) =>
    set((state) => {
      // payload may be { members, version } or array of members
      if (!payload) return state;
      if (Array.isArray(payload)) {
        return { members: payload };
      }
      const { members, version } = payload;
      if (typeof version === 'number' && version < state.memberVersion) {
        return state; // ignore older version
      }
      return {
        members: members || [],
        memberVersion: typeof version === 'number' ? version : state.memberVersion,
      };
    }),

  setMembers: (members) => set({ members: Array.isArray(members) ? members : [] }),

  setPlayerState: (playerState) =>
    set((prev) => {
      const next = { ...prev.playerState, ...playerState };
      if (typeof window !== 'undefined') {
        window.__afterspot_playerState = next;
      }
      return { playerState: next };
    }),

  setServerOffsetMs: (offset) => set({ serverOffsetMs: offset }),

  setQueueUpdate: ({ queue, nowPlaying, version }) =>
    set((state) => {
      if (typeof version === 'number' && version < state.queueVersion) {
        return state;
      }
      return {
        queue: queue || [],
        nowPlaying: nowPlaying !== undefined ? nowPlaying : state.nowPlaying,
        queueVersion: typeof version === 'number' ? version : state.queueVersion,
      };
    }),

  setSkipVotes: (skipVotes) => set({ skipVotes }),

  setChatHistory: (messages) => set({ chatMessages: messages || [] }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-99), msg],
      unreadChatCount: state.unreadChatCount + 1,
    })),

  resetUnreadChat: () => set({ unreadChatCount: 0 }),

  setMemberSpeaking: (memberId, isSpeaking) =>
    set((state) => {
      if (state.speakingMembers[memberId] === isSpeaking) return state;
      return {
        speakingMembers: {
          ...state.speakingMembers,
          [memberId]: isSpeaking,
        },
      };
    }),

  recordSocketEvent: (dir, event, data) =>
    set((state) => {
      const entry = {
        dir,
        event,
        data,
        ts: Date.now(),
      };
      return {
        recentSocketEvents: [entry, ...state.recentSocketEvents].slice(0, 20),
      };
    }),

  setPeerDebugStats: (stats) =>
    set((state) => ({
      peerDebugStats: {
        ...state.peerDebugStats,
        ...stats,
      },
    })),
}));

export default useAppStore;

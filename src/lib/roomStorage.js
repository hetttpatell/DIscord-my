// Helper for persistent multi-room session & credential storage in localStorage

const STORAGE_KEY = 'afterspot_saved_rooms';
const LAST_ROOM_KEY = 'afterspot_last_room';

export function getSavedRooms() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('[roomStorage] Failed to read saved rooms:', err);
    return {};
  }
}

export function getSavedRoom(roomId) {
  if (!roomId || typeof window === 'undefined') return null;
  const rooms = getSavedRooms();
  return rooms[roomId.trim()] || null;
}

export function saveRoomCredentials({
  roomId,
  token = null,
  memberId = null,
  displayName = '',
  password = '',
}) {
  if (!roomId || typeof window === 'undefined') return;
  const cleanId = roomId.trim();
  try {
    const rooms = getSavedRooms();
    const existing = rooms[cleanId] || {};

    rooms[cleanId] = {
      roomId: cleanId,
      token: token || existing.token || null,
      memberId: memberId || existing.memberId || null,
      displayName: displayName || existing.displayName || '',
      password: password || existing.password || '',
      lastVisitedAt: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    localStorage.setItem(LAST_ROOM_KEY, cleanId);
  } catch (err) {
    console.warn('[roomStorage] Failed to save room credentials:', err);
  }
}

export function removeSavedRoom(roomId) {
  if (!roomId || typeof window === 'undefined') return;
  const cleanId = roomId.trim();
  try {
    const rooms = getSavedRooms();
    delete rooms[cleanId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));

    if (localStorage.getItem(LAST_ROOM_KEY) === cleanId) {
      localStorage.removeItem(LAST_ROOM_KEY);
    }
  } catch (err) {
    console.warn('[roomStorage] Failed to remove saved room:', err);
  }
}

export function getLastActiveRoom() {
  if (typeof window === 'undefined') return null;
  try {
    const lastId = localStorage.getItem(LAST_ROOM_KEY);
    if (!lastId) return null;
    return getSavedRoom(lastId);
  } catch {
    return null;
  }
}

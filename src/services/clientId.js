/**
 * Persistent Client Identity Management
 * Provides a stable unique identifier stored in localStorage across browser sessions.
 */
export function getClientId() {
  if (typeof window === 'undefined') return 'server';
  let cid = null;
  try {
    cid = localStorage.getItem('togetherTune_clientId');
    if (!cid) {
      cid = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('togetherTune_clientId', cid);
    }
  } catch {
    cid = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  return cid;
}

export default getClientId;


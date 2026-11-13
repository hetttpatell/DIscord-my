/**
 * Per-Tab Client Identity Management
 * Provides a unique, stable client identifier stored in sessionStorage.
 * This guarantees that:
 * 1. Each browser tab has its own distinct identity and counts as a separate member.
 * 2. Page reloads/refreshes within the same tab preserve the client identity and resume session.
 */
let memoryClientId = null;

export function getClientId() {
  if (typeof window === 'undefined') return 'server';
  try {
    let cid = sessionStorage.getItem('afterspot_tabClientId');
    if (!cid) {
      cid = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem('afterspot_tabClientId', cid);
    }
    return cid;
  } catch {
    if (!memoryClientId) {
      memoryClientId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
    return memoryClientId;
  }
}

export default getClientId;

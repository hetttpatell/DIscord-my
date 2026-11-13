import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { participantsStore, normalizeQuality } from './participantsStore.js';

describe('participantsStore Unit Tests', () => {
  it('normalizes connection qualities correctly', () => {
    assert.equal(normalizeQuality('good'), 'good');
    assert.equal(normalizeQuality('fair'), 'medium');
    assert.equal(normalizeQuality('medium'), 'medium');
    assert.equal(normalizeQuality('poor'), 'poor');
    assert.equal(normalizeQuality('unknown'), 'unknown');
    assert.equal(normalizeQuality('random'), 'unknown');
  });

  it('sets and updates local user record', () => {
    participantsStore.reset();
    participantsStore.setLocalUser({
      id: 'local-123',
      name: 'Host User',
      isHost: true,
      clientId: 'client-123'
    });

    const local = participantsStore.getLocalParticipant();
    assert.ok(local);
    assert.equal(local.id, 'local-123');
    assert.equal(local.isLocal, true);
    assert.equal(local.isHost, true);
    assert.equal(local.name, 'Host User');
    assert.equal(local.connectionQuality, 'good');
  });

  it('merges signaling members and peers with full record schema', () => {
    participantsStore.reset();
    participantsStore.setLocalUser({ id: 'local-1' });

    participantsStore.setSignalingMembers([
      { id: 'peer-1', name: 'Alice', isHost: false },
      { id: 'peer-2', name: 'Bob', isHost: false }
    ]);

    participantsStore.syncPeers({
      'peer-1': { isMuted: false, connectionQuality: 'fair' }
    });

    const p1 = participantsStore.getParticipant('peer-1');
    assert.ok(p1);
    assert.equal(p1.name, 'Alice');
    assert.equal(p1.audioEnabled, true);
    assert.equal(p1.connectionQuality, 'medium'); // fair -> medium

    const ids = participantsStore.getParticipantIds();
    assert.ok(ids.includes('local-1'));
    assert.ok(ids.includes('peer-1'));
    assert.ok(ids.includes('peer-2'));
  });

  it('audio levels can be updated and subscribed outside React state', () => {
    participantsStore.reset();
    let heardLevel = null;
    const unsub = participantsStore.subscribeAudioLevel('peer-1', (lvl) => {
      heardLevel = lvl;
    });

    participantsStore.setAudioLevel('peer-1', 0.75);
    assert.equal(heardLevel, 0.75);
    assert.equal(participantsStore.getAudioLevel('peer-1'), 0.75);
    unsub();
  });

  it('active speaker requires 300ms sustained speech', async () => {
    participantsStore.reset();
    participantsStore.setSignalingMembers([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' }
    ]);

    // Speech burst less than 300ms should NOT activate speaker
    participantsStore.reportSpeechActivity('p1', true);
    await new Promise(r => setTimeout(r, 100));
    participantsStore.reportSpeechActivity('p1', false);
    await new Promise(r => setTimeout(r, 250));

    assert.equal(participantsStore.getActiveSpeakerId(), null);

    // Sustained speech >= 300ms promotes candidate to active speaker
    participantsStore.reportSpeechActivity('p1', true);
    await new Promise(r => setTimeout(r, 350));

    assert.equal(participantsStore.getActiveSpeakerId(), 'p1');
    participantsStore.reportSpeechActivity('p1', false);
  });

  it('active speaker holds status for at least 1500ms before moving to someone else', async () => {
    participantsStore.reset();
    participantsStore.setSignalingMembers([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' }
    ]);

    // P1 speaks sustainedly -> becomes active speaker
    participantsStore.reportSpeechActivity('p1', true);
    await new Promise(r => setTimeout(r, 350));
    assert.equal(participantsStore.getActiveSpeakerId(), 'p1');

    // P2 starts speaking 200ms after P1 became active
    participantsStore.reportSpeechActivity('p2', true);
    await new Promise(r => setTimeout(r, 350));
    assert.equal(participantsStore.getActiveSpeakerId(), 'p1');

    // Wait until full 1500ms has elapsed since P1 became active
    await new Promise(r => setTimeout(r, 1300));
    assert.equal(participantsStore.getActiveSpeakerId(), 'p2');

    participantsStore.reportSpeechActivity('p2', false);
  });

  it('subscription methods are safe when passed detached without this context', () => {
    participantsStore.reset();
    const { subscribe, subscribeIds, subscribeActiveSpeaker, getSnapshot, getActiveSpeakerId, getParticipantIds } = participantsStore;

    const unsubSpeaker = subscribeActiveSpeaker(() => {});
    const unsubIds = subscribeIds(() => {});
    const unsubGlobal = subscribe(() => {});

    assert.equal(getActiveSpeakerId(), null);
    assert.ok(Array.isArray(getParticipantIds()));
    assert.ok(Array.isArray(getSnapshot()));

    unsubSpeaker();
    unsubIds();
    unsubGlobal();
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { peerService, sanitizePeerId, formatPeerId } from './peerService.js';

describe('PeerService Unit Tests', () => {
  beforeEach(() => {
    peerService.cleanupCallState();
    peerService.cleanupAudioNodes();
    peerService.callState = 'idle';
    peerService.error = null;
  });

  it('sanitizes and formats PeerJS IDs correctly', () => {
    assert.equal(sanitizePeerId('Room 123!@#'), 'Room_123___');
    assert.equal(sanitizePeerId('user-456_abc'), 'user-456_abc');
    assert.equal(formatPeerId('ABC123', 'client-789'), 'afterspot-abc123-client-789');
  });

  it('starts in idle call state with null remoteUser', () => {
    const state = peerService.getState();
    assert.equal(state.callState, 'idle');
    assert.equal(state.remoteUser, null);
    assert.equal(state.callDuration, 0);
    assert.deepEqual(peerService.getPeers(), {});
  });

  it('handles incoming call and sets state to ringing with metadata', () => {
    let notifiedState = null;
    const unsub = peerService.subscribe((event, payload, state) => {
      if (event === 'incoming-call') {
        notifiedState = state;
      }
    });

    const mockIncomingCall = {
      peer: 'afterspot-room1-tab_alice',
      metadata: {
        callerId: 'tab_alice',
        callerName: 'Alice',
        callerAvatar: '#10b981'
      },
      on: () => {},
      close: () => {}
    };

    peerService.handleIncomingCall(mockIncomingCall);

    assert.equal(peerService.callState, 'ringing');
    assert.ok(peerService.remoteUser);
    assert.equal(peerService.remoteUser.name, 'Alice');
    assert.equal(peerService.remoteUser.clientId, 'tab_alice');
    assert.ok(notifiedState);
    assert.equal(notifiedState.callState, 'ringing');

    unsub();
  });

  it('rejectCall closes the incoming call and returns to idle', () => {
    let closed = false;
    const mockIncomingCall = {
      peer: 'peer_1',
      metadata: { callerId: 'c1', callerName: 'Bob' },
      on: () => {},
      close: () => { closed = true; }
    };

    peerService.handleIncomingCall(mockIncomingCall);
    assert.equal(peerService.callState, 'ringing');

    peerService.rejectCall();
    assert.equal(closed, true);
    assert.equal(peerService.callState, 'idle');
    assert.equal(peerService.remoteUser, null);
  });

  it('endCall cleanly terminates call and resets state and peers', () => {
    let closed = false;
    peerService.currentCall = {
      close: () => { closed = true; }
    };
    peerService.callState = 'connected';
    peerService.remoteUser = { id: 'user_2', clientId: 'user_2', name: 'Charlie' };
    peerService.callDuration = 45;

    peerService.endCall('User hung up');

    assert.equal(closed, true);
    assert.equal(peerService.remoteUser, null);
    assert.equal(peerService.callDuration, 0);
    assert.deepEqual(peerService.getPeers(), {});
  });

  it('setVoicesVolume clamps and stores volume correctly', () => {
    peerService.setVoicesVolume(75);
    assert.equal(peerService.voicesVolume, 75);

    peerService.setVoicesVolume(150);
    assert.equal(peerService.voicesVolume, 100);

    peerService.setVoicesVolume(-20);
    assert.equal(peerService.voicesVolume, 0);
  });
});

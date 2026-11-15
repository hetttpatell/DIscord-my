import { Peer } from 'peerjs';

/**
 * Creates a placeholder black video track from a 160x90 canvas.
 * Captured at 1 fps, redrawn every 1000ms.
 */
export function createPlaceholderVideoTrack() {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');

  const drawBlack = () => {
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  drawBlack();
  const interval = setInterval(drawBlack, 1000);

  const stream = canvas.captureStream ? canvas.captureStream(1) : null;
  if (!stream) {
    clearInterval(interval);
    return null;
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    clearInterval(interval);
    return null;
  }

  const origStop = track.stop.bind(track);
  track.stop = () => {
    clearInterval(interval);
    origStop();
  };

  return track;
}

/**
 * Cap outgoing video bitrate at 500,000 bps using getParameters/setParameters
 */
export async function capBitrate(sender) {
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params) return;
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 500000; // 500 kbps
    await sender.setParameters(params);
  } catch (err) {
    console.warn('[peerMesh] Failed to cap bitrate:', err.message);
  }
}

/**
 * PeerMeshManager manages full mesh PeerJS calling, canvas placeholder video track,
 * in-place camera replaceTrack, bitrate capping, and stream cleanup.
 */
export class PeerMeshManager {
  constructor({
    myPeerId,
    micAudioTrack,
    onRemoteStream,
    onRemoteStreamRemoved,
    onDebugUpdate,
  }) {
    this.myPeerId = myPeerId;
    this.micAudioTrack = micAudioTrack;
    this.onRemoteStream = onRemoteStream;
    this.onRemoteStreamRemoved = onRemoteStreamRemoved;
    this.onDebugUpdate = onDebugUpdate;

    this.peer = null;
    this.placeholderTrack = null;
    this.cameraTrack = null;
    this.currentFacingMode = 'user';
    this.outgoingStream = null;

    this.activeCalls = new Map(); // remotePeerId -> MediaConnection
    this.remoteStreams = new Map(); // remotePeerId -> MediaStream
  }

  async init() {
    this.placeholderTrack = createPlaceholderVideoTrack();

    // Construct outgoing stream with mic track + current video track (placeholder)
    const tracks = [];
    if (this.micAudioTrack) {
      tracks.push(this.micAudioTrack);
    }
    if (this.placeholderTrack) {
      tracks.push(this.placeholderTrack);
    }

    this.outgoingStream = new MediaStream(tracks);

    // Initialize PeerJS
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(this.myPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });

        this.peer.on('open', (id) => {
          this.myPeerId = id;
          this.updateDebugStats();
          resolve(id);
        });

        this.peer.on('call', (call) => {
          this.handleIncomingCall(call);
        });

        this.peer.on('error', (err) => {
          console.warn('[peerMesh] PeerJS error:', err);
          this.updateDebugStats();
        });

        this.peer.on('close', () => {
          this.updateDebugStats();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  getCurrentVideoTrack() {
    return this.cameraTrack || this.placeholderTrack;
  }

  handleIncomingCall(call) {
    const remotePeerId = call.peer;

    // Answer with our full outgoing stream (mic + current video track)
    call.answer(this.outgoingStream);
    this.setupCallHandlers(call, remotePeerId);
  }

  setupCallHandlers(call, remotePeerId) {
    this.activeCalls.set(remotePeerId, call);

    call.on('stream', (remoteStream) => {
      this.remoteStreams.set(remotePeerId, remoteStream);
      if (this.onRemoteStream) {
        this.onRemoteStream(remotePeerId, remoteStream);
      }
      this.updateDebugStats();
    });

    call.on('close', () => {
      this.handleCallClosed(remotePeerId);
    });

    call.on('error', (err) => {
      console.warn(`[peerMesh] Call error with ${remotePeerId}:`, err);
      this.handleCallClosed(remotePeerId);
    });

    // When connection state changes or connects, cap outgoing video bitrate
    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            capBitrate(videoSender);
          }
        }
        this.updateDebugStats();
      });

      // Attempt immediate cap as well
      const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (videoSender) {
        capBitrate(videoSender);
      }
    }

    this.updateDebugStats();
  }

  handleCallClosed(remotePeerId) {
    this.activeCalls.delete(remotePeerId);
    this.remoteStreams.delete(remotePeerId);
    if (this.onRemoteStreamRemoved) {
      this.onRemoteStreamRemoved(remotePeerId);
    }
    this.updateDebugStats();
  }

  /**
   * Syncs mesh calls with current room members according to lexicographical order:
   * "the member with the lexicographically smaller peerId calls the other when room:members shows a new member."
   */
  syncMembers(members) {
    if (!this.peer || !this.myPeerId || !Array.isArray(members)) return;

    const currentPeerIds = new Set();

    for (const member of members) {
      const remotePeerId = member.peerId;
      if (!remotePeerId || remotePeerId === this.myPeerId) continue;

      currentPeerIds.add(remotePeerId);

      // Lexicographical order check: only the smaller ID calls the larger ID
      if (this.myPeerId < remotePeerId) {
        if (!this.activeCalls.has(remotePeerId)) {
          this.callPeer(remotePeerId);
        }
      }
    }

    // Close calls to peers that are no longer in room:members
    for (const [remotePeerId, call] of this.activeCalls.entries()) {
      if (!currentPeerIds.has(remotePeerId)) {
        try {
          call.close();
        } catch {}
        this.handleCallClosed(remotePeerId);
      }
    }

    this.updateDebugStats();
  }

  callPeer(remotePeerId) {
    if (!this.peer || !this.outgoingStream) return;
    try {
      const call = this.peer.call(remotePeerId, this.outgoingStream);
      if (call) {
        this.setupCallHandlers(call, remotePeerId);
      }
    } catch (err) {
      console.warn(`[peerMesh] Failed to call ${remotePeerId}:`, err);
    }
  }

  /**
   * Turn Camera ON:
   * First awaited operation: getUserMedia.
   * On success: replaceTrack on all active calls, cap bitrate, update local outgoing stream.
   */
  async turnCameraOn(facingMode = this.currentFacingMode) {
    this.currentFacingMode = facingMode;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: this.currentFacingMode,
        },
        audio: false,
      });

      const newCameraTrack = stream.getVideoTracks()[0];
      if (!newCameraTrack) {
        throw new Error('No video track returned');
      }

      // Stop previous camera track if any
      if (this.cameraTrack) {
        this.cameraTrack.stop();
      }

      this.cameraTrack = newCameraTrack;

      // Replace track on all active calls
      await this.replaceVideoTrackOnCalls(newCameraTrack);

      this.updateDebugStats();
      return { ok: true, track: newCameraTrack };
    } catch (err) {
      const errorName = err?.name || 'Error';
      let message = 'Failed to access camera.';
      if (errorName === 'NotAllowedError') {
        message = 'Camera permission was denied.';
      } else if (errorName === 'NotFoundError') {
        message = 'No camera found on this device.';
      } else if (errorName === 'NotReadableError') {
        message = 'Camera is currently in use by another application or tab.';
      } else if (errorName === 'OverconstrainedError') {
        message = 'Camera constraints could not be satisfied.';
      }

      console.warn('[peerMesh] Camera error:', errorName, message);
      return { ok: false, name: errorName, message };
    }
  }

  /**
   * Turn Camera OFF:
   * Stop camera track, replaceTrack back to placeholder track on all active calls.
   */
  async turnCameraOff() {
    if (this.cameraTrack) {
      try {
        this.cameraTrack.stop();
      } catch {}
      this.cameraTrack = null;
    }

    // Replace with placeholder track
    if (!this.placeholderTrack || this.placeholderTrack.readyState === 'ended') {
      this.placeholderTrack = createPlaceholderVideoTrack();
    }

    await this.replaceVideoTrackOnCalls(this.placeholderTrack);
    this.updateDebugStats();
  }

  /**
   * Flip camera on mobile: toggles between 'user' and 'environment'
   */
  async flipCamera() {
    const nextFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    return this.turnCameraOn(nextFacingMode);
  }

  async replaceVideoTrackOnCalls(newTrack) {
    if (!newTrack) return;

    for (const [remotePeerId, call] of this.activeCalls.entries()) {
      try {
        const pc = call.peerConnection;
        if (!pc) continue;

        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
          await capBitrate(sender);
        }
      } catch (err) {
        console.warn(`[peerMesh] Failed to replaceTrack for ${remotePeerId}:`, err);
      }
    }
  }

  updateDebugStats() {
    if (!this.onDebugUpdate) return;

    const callsStats = [];
    const sendersStats = [];

    for (const [remotePeerId, call] of this.activeCalls.entries()) {
      const pc = call.peerConnection;
      callsStats.push({
        peerId: remotePeerId,
        open: call.open,
        connectionState: pc?.connectionState || 'unknown',
        iceConnectionState: pc?.iceConnectionState || 'unknown',
      });

      if (pc) {
        for (const s of pc.getSenders()) {
          if (s.track) {
            sendersStats.push({
              peerId: remotePeerId,
              kind: s.track.kind,
              hasTrack: Boolean(s.track),
              readyState: s.track.readyState,
              enabled: s.track.enabled,
            });
          }
        }
      }
    }

    this.onDebugUpdate({
      peerId: this.myPeerId,
      calls: callsStats,
      senders: sendersStats,
    });
  }

  destroy() {
    // Close all active calls
    for (const [, call] of this.activeCalls.entries()) {
      try {
        call.close();
      } catch {}
    }
    this.activeCalls.clear();
    this.remoteStreams.clear();

    // Stop placeholder track
    if (this.placeholderTrack) {
      try {
        this.placeholderTrack.stop();
      } catch {}
      this.placeholderTrack = null;
    }

    // Stop camera track
    if (this.cameraTrack) {
      try {
        this.cameraTrack.stop();
      } catch {}
      this.cameraTrack = null;
    }

    // Destroy PeerJS instance
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.updateDebugStats();
  }
}

export default PeerMeshManager;


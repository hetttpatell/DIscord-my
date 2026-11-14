/**
 * useVoiceCall
 * React hook for 1-to-1 voice calling with PeerJS.
 *
 * Provides:
 * - Call lifecycle states: 'idle', 'calling', 'ringing', 'connected', 'disconnected', 'error'
 * - Active caller / callee user details and remote audio stream
 * - Complete call actions: startCall, acceptCall, rejectCall, endCall, toggleMute
 * - Elapsed call duration and live speaking detection
 * - Audio volume control and mobile audio unlocking
 */

import { useState, useEffect, useCallback } from 'react';
import peerService from '../services/peerService.js';

export function useVoiceCall({ roomId, currentUser, voicesVolume = 100 } = {}) {
  const [state, setState] = useState(() => peerService.getState());

  // Initialize peer connection when room and user are available
  useEffect(() => {
    if (!roomId || !currentUser) return;

    peerService.init({
      roomId,
      user: currentUser,
      sessionId: currentUser.clientId || currentUser.id
    });
  }, [roomId, currentUser]);

  // Subscribe to peerService state updates
  useEffect(() => {
    const unsub = peerService.subscribe((_event, _payload, newState) => {
      setState(newState || peerService.getState());
    });
    return () => unsub();
  }, []);

  // Sync voices volume
  useEffect(() => {
    peerService.setVoicesVolume(voicesVolume);
  }, [voicesVolume]);

  const startCall = useCallback((targetMember) => {
    return peerService.startCall(targetMember);
  }, []);

  const acceptCall = useCallback(() => {
    return peerService.acceptCall();
  }, []);

  const rejectCall = useCallback(() => {
    return peerService.rejectCall();
  }, []);

  const endCall = useCallback((reason) => {
    return peerService.endCall(reason);
  }, []);

  const toggleMute = useCallback(() => {
    return peerService.toggleMute();
  }, []);

  const setMuted = useCallback((muted) => {
    return peerService.setMuted(muted);
  }, []);

  const unlockAudio = useCallback(async () => {
    return peerService.unlockAudio();
  }, []);

  return {
    isReady: state.isReady,
    peerId: state.peerId,
    callState: state.callState,
    remoteUser: state.remoteUser,
    remoteStream: state.remoteStream,
    callDuration: state.callDuration,
    isMuted: state.isMuted,
    isSpeaking: state.isSpeaking,
    error: state.error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    setMuted,
    unlockAudio
  };
}

export default useVoiceCall;


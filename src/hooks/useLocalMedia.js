import { useState, useEffect, useCallback } from 'react';
import mediaController from '../services/mediaController';

/**
 * React hook wrapping mediaController for audio microphone state and controls.
 */
export function useLocalMedia() {
  const [mediaState, setMediaState] = useState(() => mediaController.getState());
  const [streamVersion, setStreamVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = mediaController.subscribe((_event, payload, state) => {
      const current = state || payload || mediaController.getState();
      if (current) {
        setMediaState(current);
        setStreamVersion(v => v + 1);
      }
    });
    return () => unsubscribe();
  }, []);

  const toggleMic = useCallback(async () => {
    return mediaController.toggleMic();
  }, []);

  const enableMic = useCallback(async () => {
    return mediaController.enableMic();
  }, []);

  const disableMic = useCallback(async () => {
    return mediaController.disableMic();
  }, []);

  const startAudio = useCallback(async (initialMuted = false) => {
    if (initialMuted) {
      await mediaController.disableMic();
      return mediaController.stream?.getAudioTracks().find(t => t.readyState === 'live') || null;
    }
    return mediaController.enableMic();
  }, []);

  const stopAll = useCallback(() => {
    mediaController.cleanupOnLeaveRoom();
  }, []);

  const setAudioInput = useCallback(async (deviceId) => {
    return mediaController.setAudioInput(deviceId);
  }, []);

  const setAudioOutput = useCallback((deviceId) => {
    mediaController.setAudioOutput(deviceId);
  }, []);

  const retryPermission = useCallback(async () => {
    return mediaController.retryPermission();
  }, []);

  return {
    stream: mediaState?.stream || null,
    streamVersion,
    micState: mediaState?.micState || 'off',
    isMicOn: Boolean(mediaState?.isMicOn),
    isSpeaking: Boolean(mediaState?.isSpeaking),
    error: mediaState?.error || null,
    isSecureContext: Boolean(mediaState?.isSecureContext),
    isAudioMutedBySystem: Boolean(mediaState?.isAudioMutedBySystem),
    selectedMicId: mediaState?.selectedMicId || '',
    selectedSpeakerId: mediaState?.selectedSpeakerId || '',
    toggleMic,
    enableMic,
    disableMic,
    startAudio,
    stopAll,
    setAudioInput,
    setAudioOutput,
    retryPermission
  };
}

export default useLocalMedia;

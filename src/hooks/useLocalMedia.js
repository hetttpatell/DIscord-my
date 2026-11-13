import { useState, useEffect, useCallback } from 'react';
import mediaController from '../services/mediaController';

/**
 * React hook wrapping mediaController for reactive components.
 * Subscribes to the single application-wide mediaController state.
 */
export function useLocalMedia() {
  const [mediaState, setMediaState] = useState(() => mediaController.getState());
  const [streamVersion, setStreamVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = mediaController.subscribe((_event, _payload, state) => {
      setMediaState(state);
      setStreamVersion(v => v + 1);
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

  const toggleCamera = useCallback(async () => {
    return mediaController.toggleCamera();
  }, []);

  const enableCamera = useCallback(async () => {
    return mediaController.enableCamera();
  }, []);

  const disableCamera = useCallback(async () => {
    return mediaController.disableCamera();
  }, []);

  const switchCamera = useCallback(async () => {
    return mediaController.switchCamera();
  }, []);

  const startAudio = useCallback(async (initialMuted = false) => {
    if (initialMuted) {
      await mediaController.disableMic();
      return mediaController.stream?.getAudioTracks().find(t => t.readyState === 'live') || null;
    }
    return mediaController.enableMic();
  }, []);

  const startVideo = useCallback(async () => {
    return mediaController.enableCamera();
  }, []);

  const stopAll = useCallback(() => {
    mediaController.cleanupOnLeaveRoom();
  }, []);

  return {
    stream: mediaState.stream,
    streamVersion,
    micState: mediaState.micState,
    cameraState: mediaState.cameraState,
    isMicOn: mediaState.isMicOn,
    isCameraOn: mediaState.isCameraOn,
    facingMode: mediaState.facingMode,
    isSpeaking: mediaState.isSpeaking,
    error: mediaState.error,
    isSecureContext: mediaState.isSecureContext,
    isAudioMutedBySystem: mediaState.isAudioMutedBySystem,
    isVideoMutedBySystem: mediaState.isVideoMutedBySystem,
    toggleMic,
    enableMic,
    disableMic,
    toggleCamera,
    enableCamera,
    disableCamera,
    switchCamera,
    startAudio,
    startVideo,
    stopAll
  };
}

export default useLocalMedia;

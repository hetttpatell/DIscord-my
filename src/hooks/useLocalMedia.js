import { useState, useEffect, useCallback } from 'react';
import mediaService from '../services/mediaService';

/**
 * React hook wrapping mediaService for reactive components
 */
export function useLocalMedia() {
  const [stream, setStream] = useState(mediaService.localStream);
  const [streamVersion, setStreamVersion] = useState(0);
  const [isMicOn, setIsMicOn] = useState(mediaService.isMicOn);
  const [isCameraOn, setIsCameraOn] = useState(mediaService.isCameraOn);
  const [facingMode, setFacingMode] = useState(mediaService.facingMode);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const [isSecureContext, setIsSecureContext] = useState(
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false
  );

  useEffect(() => {
    setIsSecureContext(typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false);

    const unsubscribe = mediaService.subscribe((event, payload, state) => {
      if (event === 'stream-changed') {
        setStream(state.stream ? new MediaStream(state.stream.getTracks()) : null);
        setStreamVersion(v => v + 1);
        setIsMicOn(state.isMicOn);
        setIsCameraOn(state.isCameraOn);
      } else if (event === 'state-changed') {
        setIsMicOn(state.isMicOn);
        setIsCameraOn(state.isCameraOn);
        setFacingMode(state.facingMode);
      } else if (event === 'speaking') {
        setIsSpeaking(Boolean(payload.isSpeaking));
      } else if (event === 'error') {
        setError(payload);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const toggleMic = useCallback(async () => {
    setError(null);
    return mediaService.toggleMic();
  }, []);

  const toggleCamera = useCallback(async () => {
    setError(null);
    return mediaService.toggleCamera();
  }, []);

  const switchCamera = useCallback(async () => {
    setError(null);
    return mediaService.switchCamera();
  }, []);

  const startAudio = useCallback(async (initialMuted = false) => {
    setError(null);
    return mediaService.acquireAudioTrack(initialMuted);
  }, []);

  const startVideo = useCallback(async () => {
    setError(null);
    return mediaService.acquireVideoTrack();
  }, []);

  const stopAll = useCallback(() => {
    mediaService.stopAll();
    setStream(null);
    setStreamVersion(v => v + 1);
    setIsMicOn(false);
    setIsCameraOn(false);
    setIsSpeaking(false);
  }, []);

  return {
    stream,
    streamVersion,
    isMicOn,
    isCameraOn,
    facingMode,
    isSpeaking,
    error,
    isSecureContext,
    toggleMic,
    toggleCamera,
    switchCamera,
    startAudio,
    startVideo,
    stopAll
  };
}

export default useLocalMedia;


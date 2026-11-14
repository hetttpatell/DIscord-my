import React, { useState, useEffect, useMemo } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { apiRequest } from '../../lib/api';
import { useAppStore } from '../../stores/useAppStore';
import { useWakeLock } from './useWakeLock';
import { StartAudioBanner } from './StartAudioBanner';
import { VoiceContext } from './VoiceContext';

export function LiveKitVoiceProvider({ children }) {
  const token = useAppStore((s) => s.token);
  const roomId = useAppStore((s) => s.roomId);
  const [voiceData, setVoiceData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Screen wake lock while in the room
  useWakeLock(Boolean(voiceData?.token));

  // Fetch LiveKit Voice Token from server
  useEffect(() => {
    if (!token || !roomId) return;

    let isCancelled = false;

    const fetchVoiceToken = async () => {
      try {
        const data = await apiRequest('/api/voice-token', {
          method: 'POST',
          token,
        });

        if (!isCancelled && data?.token && data?.url) {
          setVoiceData(data);
        }
      } catch (err) {
        console.warn('[LiveKitVoiceProvider] Voice token fetch error:', err.message);
        setConnectionError(err.message);
      }
    };

    fetchVoiceToken();

    return () => {
      isCancelled = true;
    };
  }, [token, roomId]);

  const roomOptions = useMemo(
    () => ({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: {
        dtx: true,
        red: true,
      },
      adaptiveStream: true,
      disconnectOnPageLeave: true,
    }),
    []
  );

  const handleConnected = () => {
    setIsConnected(true);
    setConnectionError(null);
  };

  const handleDisconnected = () => {
    setIsConnected(false);
  };

  const handleError = (error) => {
    console.warn('[LiveKitVoiceProvider] Connection error:', error?.message || error);
    setConnectionError(error?.message || 'Voice connection failed');
    setIsConnected(false);
  };

  // If no voice data or LiveKit credentials failed / not connected, provide safe fallback
  if (!voiceData?.token || !voiceData?.url) {
    return (
      <VoiceContext.Provider
        value={{
          isLiveKitActive: false,
          isConnected: false,
          error: connectionError,
        }}
      >
        {children}
      </VoiceContext.Provider>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      video={false}
      connect={true}
      token={voiceData.token}
      serverUrl={voiceData.url}
      options={roomOptions}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
      data-lk-theme="default"
    >
      <VoiceContext.Provider
        value={{
          isLiveKitActive: isConnected,
          isConnected,
          error: connectionError,
        }}
      >
        {/* Single audio output path */}
        <RoomAudioRenderer />

        {/* Tap to enable sound banner on browser autoplay block */}
        <StartAudioBanner />

        {/* Informative banner if credentials are not configured or invalid */}
        {connectionError && (
          <div className="fixed top-14 left-0 right-0 z-30 bg-[#FF9F1C]/20 border-b border-[#FF9F1C]/30 px-4 py-1.5 text-center text-[11px] text-[#F4F1EA] backdrop-blur-md">
            Voice server credentials need setup (see README). Local mic &amp; synchronized video are active.
          </div>
        )}

        {children}
      </VoiceContext.Provider>
    </LiveKitRoom>
  );
}

export default LiveKitVoiceProvider;

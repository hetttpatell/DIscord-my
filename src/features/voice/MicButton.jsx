import React, { useState, useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track, LocalAudioTrack } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/Button';
import { MicPermissionSheet } from './MicPermissionSheet';
import { useVoiceContext } from './VoiceContext';
import {
  requestMicrophoneStream,
  stopMicrophone,
  getActiveMicrophoneStream,
  setMicrophoneMuted,
} from '../../lib/microphone';
import {
  createProcessedAudioStream,
  cleanupVoiceEffects,
  getCurrentVoicePreset,
} from '../../lib/voiceEffects';

function LiveKitMicButton({ className }) {
  const room = useRoomContext();
  const [isMicActive, setIsMicActive] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const localAudioTrackRef = useRef(null);

  // Recovery without reload: when returning from settings, dismiss sheet and prompt tap
  useEffect(() => {
    let permStatus = null;

    const checkAndRecover = (state) => {
      if (state === 'granted' || state === 'prompt') {
        if (isSheetOpen) {
          setIsSheetOpen(false);
          setErrorInfo(null);
          toast.info('Tap the mic to continue');
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          if (navigator.permissions?.query) {
            const status = await navigator.permissions.query({ name: 'microphone' });
            checkAndRecover(status?.state);
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    try {
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'microphone' })
          .then((status) => {
            permStatus = status;
            status.onchange = () => {
              checkAndRecover(status.state);
            };
          })
          .catch(() => {});
      }
    } catch {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, [isSheetOpen]);

  // Clean up tracks when room leaves or unmounts
  useEffect(() => {
    return () => {
      if (localAudioTrackRef.current) {
        try {
          room?.localParticipant?.unpublishTrack(localAudioTrackRef.current);
          localAudioTrackRef.current.stop();
        } catch {}
        localAudioTrackRef.current = null;
      }
      stopMicrophone();
      cleanupVoiceEffects();
    };
  }, [room]);

  const handleMicError = async (err) => {
    const errorName = err?.name || 'Error';
    const errorMessage = err?.message || '';
    const isSecure = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let permissionState = 'unknown';

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        permissionState = status?.state || 'unknown';
      }
    } catch {}

    // Required diagnostic console.error
    console.error('[mic]', {
      name: errorName,
      message: errorMessage,
      permissionState,
      isSecureContext: isSecure,
      userAgent,
    });

    // ONLY SHOW OVERLAY ON REAL NotAllowedError
    if (errorName === 'NotAllowedError') {
      const msgLower = errorMessage.toLowerCase();
      let type = 'site_settings';
      if (msgLower.includes('system')) {
        type = 'android_system';
      } else if (msgLower.includes('dismissed')) {
        type = 'dismissed';
      }

      setErrorInfo({
        name: errorName,
        message: errorMessage,
        type,
      });
      setIsSheetOpen(true);
      return;
    }

    // Never show denied overlay for non-NotAllowedError
    if (errorName === 'NotReadableError' || errorName === 'AbortError') {
      toast.error('Another app or tab is using the microphone. Close it and try again.');
    } else if (errorName === 'NotFoundError') {
      toast.error('No microphone found on this device.');
    } else if (errorName === 'SecurityError') {
      toast.error(errorMessage || 'Microphone blocked by security policy (HTTPS required).');
    } else {
      toast.error(`${errorName}: ${errorMessage || 'Failed to capture microphone'}`);
    }
  };

  const handleToggleClick = async () => {
    // 1. If currently active, simply mute via track.enabled
    if (isMicActive) {
      setMicrophoneMuted(true);
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.mediaStreamTrack.enabled = false;
        localAudioTrackRef.current.mute().catch(() => {});
      }
      setIsMicActive(false);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: false });
      }
      return;
    }

    // 2. If stream already exists, reuse it and unmute
    const existing = getActiveMicrophoneStream();
    if (existing) {
      setMicrophoneMuted(false);
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.mediaStreamTrack.enabled = true;
        localAudioTrackRef.current.unmute().catch(() => {});
      }
      setIsMicActive(true);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: true });
      }
      return;
    }

    // 3. User tapped to unmute: invoke getUserMedia as the VERY FIRST awaited operation
    try {
      const rawStream = await requestMicrophoneStream();
      const currentPreset = getCurrentVoicePreset();
      const processedStream = createProcessedAudioStream(rawStream, currentPreset);
      const audioTrack = processedStream.getAudioTracks()[0] || rawStream.getAudioTracks()[0];

      if (room?.localParticipant && audioTrack) {
        const localTrack = new LocalAudioTrack(audioTrack);
        localAudioTrackRef.current = localTrack;
        await room.localParticipant.publishTrack(localTrack, {
          source: Track.Source.Microphone,
        });
      }

      setIsMicActive(true);
      setIsSheetOpen(false);
      setErrorInfo(null);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: true });
      }
    } catch (err) {
      await handleMicError(err);
    }
  };

  return (
    <>
      <Button
        variant={isMicActive ? 'primary' : 'secondary'}
        size="default"
        onClick={handleToggleClick}
        aria-label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
        className={className}
      >
        {isMicActive ? (
          <>
            <Mic className="w-4 h-4 shrink-0 text-[#0B0B10]" />
            <span className="text-[11px] sm:text-xs text-[#0B0B10] font-bold whitespace-nowrap">On Air</span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 shrink-0 text-[#FF5A5F]" />
            <span className="text-[11px] sm:text-xs font-semibold whitespace-nowrap">Muted</span>
          </>
        )}
      </Button>

      <MicPermissionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        errorInfo={errorInfo}
        onTryAgain={handleToggleClick}
      />
    </>
  );
}

function FallbackMicButton({ className }) {
  const [isMicActive, setIsMicActive] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Recovery without reload
  useEffect(() => {
    let permStatus = null;

    const checkAndRecover = (state) => {
      if (state === 'granted' || state === 'prompt') {
        if (isSheetOpen) {
          setIsSheetOpen(false);
          setErrorInfo(null);
          toast.info('Tap the mic to continue');
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          if (navigator.permissions?.query) {
            const status = await navigator.permissions.query({ name: 'microphone' });
            checkAndRecover(status?.state);
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    try {
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'microphone' })
          .then((status) => {
            permStatus = status;
            status.onchange = () => {
              checkAndRecover(status.state);
            };
          })
          .catch(() => {});
      }
    } catch {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, [isSheetOpen]);

  useEffect(() => {
    return () => {
      stopMicrophone();
      cleanupVoiceEffects();
    };
  }, []);

  const handleMicError = async (err) => {
    const errorName = err?.name || 'Error';
    const errorMessage = err?.message || '';
    const isSecure = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let permissionState = 'unknown';

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        permissionState = status?.state || 'unknown';
      }
    } catch {}

    console.error('[mic]', {
      name: errorName,
      message: errorMessage,
      permissionState,
      isSecureContext: isSecure,
      userAgent,
    });

    if (errorName === 'NotAllowedError') {
      const msgLower = errorMessage.toLowerCase();
      let type = 'site_settings';
      if (msgLower.includes('system')) {
        type = 'android_system';
      } else if (msgLower.includes('dismissed')) {
        type = 'dismissed';
      }

      setErrorInfo({
        name: errorName,
        message: errorMessage,
        type,
      });
      setIsSheetOpen(true);
      return;
    }

    if (errorName === 'NotReadableError' || errorName === 'AbortError') {
      toast.error('Another app or tab is using the microphone. Close it and try again.');
    } else if (errorName === 'NotFoundError') {
      toast.error('No microphone found on this device.');
    } else if (errorName === 'SecurityError') {
      toast.error(errorMessage || 'Microphone blocked by security policy (HTTPS required).');
    } else {
      toast.error(`${errorName}: ${errorMessage || 'Failed to capture microphone'}`);
    }
  };

  const handleToggleClick = async () => {
    // 1. If currently active, simply mute
    if (isMicActive) {
      setMicrophoneMuted(true);
      setIsMicActive(false);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: false });
      }
      return;
    }

    // 2. If stream already exists, reuse it
    const existing = getActiveMicrophoneStream();
    if (existing) {
      setMicrophoneMuted(false);
      setIsMicActive(true);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: true });
      }
      return;
    }

    // 3. Invoke getUserMedia as the VERY FIRST awaited operation
    try {
      const rawStream = await requestMicrophoneStream();
      createProcessedAudioStream(rawStream, getCurrentVoicePreset());
      setIsMicActive(true);
      setIsSheetOpen(false);
      setErrorInfo(null);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: true });
      }
    } catch (err) {
      await handleMicError(err);
    }
  };

  return (
    <>
      <Button
        variant={isMicActive ? 'primary' : 'secondary'}
        size="default"
        onClick={handleToggleClick}
        aria-label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
        className={className}
      >
        {isMicActive ? (
          <>
            <Mic className="w-4 h-4 shrink-0 text-[#0B0B10]" />
            <span className="text-[11px] sm:text-xs text-[#0B0B10] font-bold whitespace-nowrap">On Air</span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 shrink-0 text-[#FF5A5F]" />
            <span className="text-[11px] sm:text-xs font-semibold whitespace-nowrap">Muted</span>
          </>
        )}
      </Button>

      <MicPermissionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        errorInfo={errorInfo}
        onTryAgain={handleToggleClick}
      />
    </>
  );
}

export function MicButton(props) {
  const { isLiveKitActive } = useVoiceContext();
  if (isLiveKitActive) {
    return <LiveKitMicButton {...props} />;
  }
  return <FallbackMicButton {...props} />;
}

export default MicButton;

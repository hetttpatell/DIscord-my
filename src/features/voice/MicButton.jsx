import React, { useState, useEffect, useCallback } from 'react';
import { useTrackToggle, useRoomContext } from '@livekit/components-react';
import { Track, RoomEvent, MediaDeviceFailure } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { MicPermissionSheet } from './MicPermissionSheet';
import { useVoiceContext } from './VoiceContext';

function LiveKitMicButton({ className }) {
  const room = useRoomContext();
  const [permissionErrorType, setPermissionErrorType] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { buttonProps, enabled } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  useEffect(() => {
    if (!room) return;

    const handleMediaDevicesError = (error) => {
      console.warn('[LiveKit Voice] MediaDevicesError:', error);

      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setPermissionErrorType('Insecure');
        setIsSheetOpen(true);
        return;
      }

      const failure = MediaDeviceFailure.getFailure(error);
      if (failure === MediaDeviceFailure.PermissionDenied || error.name === 'NotAllowedError') {
        setPermissionErrorType('PermissionDenied');
        setIsSheetOpen(true);
      } else if (failure === MediaDeviceFailure.NotFound || error.name === 'NotFoundError') {
        setPermissionErrorType('NotFound');
        setIsSheetOpen(true);
      } else if (failure === MediaDeviceFailure.DeviceInUse || error.name === 'NotReadableError') {
        setPermissionErrorType('NotReadable');
        setIsSheetOpen(true);
      } else {
        setPermissionErrorType('PermissionDenied');
        setIsSheetOpen(true);
      }
    };

    room.on(RoomEvent.MediaDevicesError, handleMediaDevicesError);

    return () => {
      room.off(RoomEvent.MediaDevicesError, handleMediaDevicesError);
    };
  }, [room]);

  const handleToggleClick = useCallback(
    (e) => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setPermissionErrorType('Insecure');
        setIsSheetOpen(true);
        return;
      }
      buttonProps?.onClick?.(e);
    },
    [buttonProps]
  );

  return (
    <>
      <Button
        variant={enabled ? 'primary' : 'secondary'}
        size="default"
        onClick={handleToggleClick}
        aria-label={enabled ? 'Mute microphone' : 'Unmute microphone'}
        className={className}
      >
        {enabled ? (
          <>
            <Mic className="w-4 h-4 text-[#0B0B10]" />
            <span className="text-xs text-[#0B0B10] font-bold">On Air</span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 text-[#FF5A5F]" />
            <span className="text-xs">Muted</span>
          </>
        )}
      </Button>

      <MicPermissionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        errorType={permissionErrorType}
        onTryAgain={handleToggleClick}
      />
    </>
  );
}

function FallbackMicButton({ className }) {
  const [isMuted, setIsMuted] = useState(true);
  const [permissionErrorType, setPermissionErrorType] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleToggle = async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setPermissionErrorType('Insecure');
      setIsSheetOpen(true);
      return;
    }

    try {
      if (isMuted) {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (typeof window !== 'undefined') {
            window.__activeAudioStream = stream;
            window.__socket?.emit('voice:state', { isMicEnabled: true });
          }
        }
        setIsMuted(false);
      } else {
        if (typeof window !== 'undefined' && window.__activeAudioStream) {
          window.__activeAudioStream.getTracks().forEach((t) => t.stop());
          window.__activeAudioStream = null;
          window.__socket?.emit('voice:state', { isMicEnabled: false });
        }
        setIsMuted(true);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setPermissionErrorType('PermissionDenied');
      } else if (err.name === 'NotFoundError') {
        setPermissionErrorType('NotFound');
      } else if (err.name === 'NotReadableError') {
        setPermissionErrorType('NotReadable');
      } else {
        setPermissionErrorType('PermissionDenied');
      }
      setIsSheetOpen(true);
    }
  };

  return (
    <>
      <Button
        variant={!isMuted ? 'primary' : 'secondary'}
        size="default"
        onClick={handleToggle}
        aria-label={!isMuted ? 'Mute microphone' : 'Unmute microphone'}
        className={className}
      >
        {!isMuted ? (
          <>
            <Mic className="w-4 h-4 text-[#0B0B10]" />
            <span className="text-xs text-[#0B0B10] font-bold">On Air</span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 text-[#FF5A5F]" />
            <span className="text-xs">Muted</span>
          </>
        )}
      </Button>

      <MicPermissionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        errorType={permissionErrorType}
        onTryAgain={handleToggle}
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

import React, { useState, useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track, LocalVideoTrack } from 'livekit-client';
import { Camera, CameraOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/Button';
import { CameraPermissionSheet } from './CameraPermissionSheet';
import { useVoiceContext } from './VoiceContext';
import {
  requestCameraStream,
  stopCamera,
} from '../../lib/camera';

function LiveKitCameraButton({ className }) {
  const room = useRoomContext();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const localVideoTrackRef = useRef(null);

  // Recovery without reload: when returning from settings, dismiss sheet and prompt tap
  useEffect(() => {
    let permStatus = null;

    const checkAndRecover = (state) => {
      if (state === 'granted' || state === 'prompt') {
        if (isSheetOpen) {
          setIsSheetOpen(false);
          setErrorInfo(null);
          toast.info('Tap the camera to turn on video');
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          if (navigator.permissions?.query) {
            const status = await navigator.permissions.query({ name: 'camera' });
            checkAndRecover(status?.state);
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    try {
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'camera' })
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
      if (localVideoTrackRef.current) {
        try {
          room?.localParticipant?.unpublishTrack(localVideoTrackRef.current);
          localVideoTrackRef.current.stop();
        } catch {}
        localVideoTrackRef.current = null;
      }
      stopCamera();
    };
  }, [room]);

  const handleCameraError = (err) => {
    const errorName = err?.name || 'Error';
    const errorMessage = err?.message || '';

    let errorType = 'site_settings';
    if (errorName === 'NotAllowedError') {
      if (errorMessage.toLowerCase().includes('dismissed') || errorMessage.toLowerCase().includes('closed')) {
        errorType = 'dismissed';
      } else {
        errorType = 'site_settings';
      }
    } else if (errorName === 'NotReadableError' || errorName === 'AbortError') {
      errorType = 'in_use';
    }

    setErrorInfo({
      name: errorName,
      message: errorMessage,
      type: errorType,
    });
    setIsSheetOpen(true);
  };

  const handleToggleClick = async () => {
    if (isLoading) return;

    // 1. If camera is already active, turn it OFF and release hardware
    if (isCameraActive) {
      if (localVideoTrackRef.current) {
        try {
          if (room?.localParticipant) {
            await room.localParticipant.unpublishTrack(localVideoTrackRef.current);
          }
          localVideoTrackRef.current.stop();
        } catch (err) {
          console.warn('[CameraButton] Error unpublishing video track:', err);
        }
        localVideoTrackRef.current = null;
      }

      stopCamera();
      setIsCameraActive(false);

      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('camera:state', { isCameraEnabled: false });
      }
      return;
    }

    // 2. User tapped to turn camera ON: invoke getUserMedia directly
    setIsLoading(true);
    try {
      const stream = await requestCameraStream({ facingMode: 'user' });
      const videoTrack = stream.getVideoTracks()[0];

      if (room?.localParticipant && videoTrack) {
        const localTrack = new LocalVideoTrack(videoTrack, { name: 'camera' });
        localVideoTrackRef.current = localTrack;
        await room.localParticipant.publishTrack(localTrack, {
          source: Track.Source.Camera,
          simulcast: true,
        });
      }

      setIsCameraActive(true);
      setIsSheetOpen(false);
      setErrorInfo(null);

      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('camera:state', { isCameraEnabled: true });
      }
    } catch (err) {
      handleCameraError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="default"
        onClick={handleToggleClick}
        disabled={isLoading}
        aria-label={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
        className={`${className} transition-all duration-200 ${
          isCameraActive
            ? '!bg-[#30D158]/15 !border-[#30D158]/40 !text-[#30D158] shadow-[0_0_16px_rgba(48,209,88,0.2)]'
            : '!bg-white/[0.08] !border-white/[0.08] !text-white/70 hover:!text-white hover:!bg-white/[0.14]'
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[#30D158]" />
            <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Starting...</span>
          </>
        ) : isCameraActive ? (
          <>
            <div className="relative">
              <Camera className="w-4 h-4 shrink-0 text-[#30D158]" />
              <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
            </div>
            <span className="text-[10px] sm:text-xs text-[#30D158] font-bold whitespace-nowrap">On Cam</span>
          </>
        ) : (
          <>
            <CameraOff className="w-4 h-4 shrink-0 text-white/70" />
            <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Cam Off</span>
          </>
        )}
      </Button>

      <CameraPermissionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        errorInfo={errorInfo}
        onTryAgain={handleToggleClick}
      />
    </>
  );
}

function FallbackCameraButton({ className }) {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleToggleClick = async () => {
    if (isLoading) return;

    if (isCameraActive) {
      stopCamera();
      setIsCameraActive(false);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('camera:state', { isCameraEnabled: false });
      }
      return;
    }

    setIsLoading(true);
    try {
      await requestCameraStream({ facingMode: 'user' });
      setIsCameraActive(true);
      setIsSheetOpen(false);
      setErrorInfo(null);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('camera:state', { isCameraEnabled: true });
      }
    } catch (err) {
      const errorName = err?.name || 'Error';
      const errorMessage = err?.message || '';
      setErrorInfo({
        name: errorName,
        message: errorMessage,
        type: 'site_settings',
      });
      setIsSheetOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="default"
        onClick={handleToggleClick}
        disabled={isLoading}
        aria-label={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
        className={`${className} transition-all duration-200 ${
          isCameraActive
            ? '!bg-[#30D158]/15 !border-[#30D158]/40 !text-[#30D158] shadow-[0_0_16px_rgba(48,209,88,0.2)]'
            : '!bg-white/[0.08] !border-white/[0.08] !text-white/70 hover:!text-white hover:!bg-white/[0.14]'
        }`}
      >
        {isCameraActive ? (
          <>
            <div className="relative">
              <Camera className="w-4 h-4 shrink-0 text-[#30D158]" />
              <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
            </div>
            <span className="text-[10px] sm:text-xs text-[#30D158] font-bold whitespace-nowrap">On Cam</span>
          </>
        ) : (
          <>
            <CameraOff className="w-4 h-4 shrink-0 text-white/70" />
            <span className="text-[10px] sm:text-xs font-semibold whitespace-nowrap">Cam Off</span>
          </>
        )}
      </Button>

      <CameraPermissionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        errorInfo={errorInfo}
        onTryAgain={handleToggleClick}
      />
    </>
  );
}

export function CameraButton(props) {
  const { isLiveKitActive } = useVoiceContext();
  if (isLiveKitActive) {
    return <LiveKitCameraButton {...props} />;
  }
  return <FallbackCameraButton {...props} />;
}

export default CameraButton;

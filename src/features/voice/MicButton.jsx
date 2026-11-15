import React, { useState, useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track, LocalAudioTrack } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { MicPermissionSheet } from './MicPermissionSheet';
import { useVoiceContext } from './VoiceContext';
import {
  requestMicrophone,
  stopMicrophone,
  getActiveMicrophoneStream,
  setMicrophoneMuted,
} from '../../lib/microphone';

function LiveKitMicButton({ className }) {
  const room = useRoomContext();
  const [isMicActive, setIsMicActive] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const localAudioTrackRef = useRef(null);

  // Sync mic state if room changes or disconnects
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
    };
  }, [room]);

  const handleToggleClick = () => {
    // 1. If currently active, mute by disabling track (do not re-request)
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

    // 3. SYNCHRONOUS invocation inside click handler (never await before this call)
    requestMicrophone().then(async (result) => {
      if (!result.ok) {
        setErrorInfo(result);
        setIsSheetOpen(true);
        return;
      }

      try {
        const audioTrack = result.stream.getAudioTracks()[0];
        if (room?.localParticipant && audioTrack) {
          const localTrack = new LocalAudioTrack(audioTrack);
          localAudioTrackRef.current = localTrack;
          await room.localParticipant.publishTrack(localTrack, {
            source: Track.Source.Microphone,
          });
        }
        setIsMicActive(true);
        if (typeof window !== 'undefined' && window.__socket) {
          window.__socket.emit('voice:state', { isMicEnabled: true });
        }
      } catch (err) {
        console.warn('[LiveKit Mic] publishTrack fallback:', err);
        setIsMicActive(true);
        if (typeof window !== 'undefined' && window.__socket) {
          window.__socket.emit('voice:state', { isMicEnabled: true });
        }
      }
    });
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

  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, []);

  const handleToggleClick = () => {
    // 1. If currently active, mute
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

    // 3. SYNCHRONOUS invocation inside click handler
    requestMicrophone().then((result) => {
      if (!result.ok) {
        setErrorInfo(result);
        setIsSheetOpen(true);
        return;
      }

      setIsMicActive(true);
      if (typeof window !== 'undefined' && window.__socket) {
        window.__socket.emit('voice:state', { isMicEnabled: true });
      }
    });
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

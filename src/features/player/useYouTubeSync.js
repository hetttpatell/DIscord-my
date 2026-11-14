import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../stores/useAppStore';

const DRIFT_THRESHOLD_SEC = 1.5;

export function useYouTubeSync({ socket, playerRef, isPlayerReady }) {
  const { playerState, setPlayerState, setServerOffsetMs, serverOffsetMs } = useAppStore();
  const isApplyingRemoteChange = useRef(false);
  const syncIntervalRef = useRef(null);

  // 1. Clock Offset Calculation via 3-sample Ping Median
  useEffect(() => {
    if (!socket) return;

    const samples = [];
    let pingsSent = 0;

    const sendPing = () => {
      if (pingsSent < 3 && socket.connected) {
        socket.emit('ping:client', { clientTime: Date.now() });
        pingsSent++;
      }
    };

    const handlePong = (data) => {
      const now = Date.now();
      const rtt = now - data.clientTime;
      const serverEstimatedTime = data.serverTime + rtt / 2;
      const offset = serverEstimatedTime - now;
      samples.push(offset);

      if (samples.length < 3) {
        setTimeout(sendPing, 100);
      } else {
        // Take median of 3 samples
        samples.sort((a, b) => a - b);
        const medianOffset = samples[1];
        setServerOffsetMs(medianOffset);
      }
    };

    socket.on('pong:server', handlePong);

    if (socket.connected) {
      sendPing();
    } else {
      socket.once('connect', sendPing);
    }

    return () => {
      socket.off('pong:server', handlePong);
    };
  }, [socket, setServerOffsetMs]);

  // Compute authoritative expected position
  const getExpectedPosition = useCallback(
    (state = playerState) => {
      if (!state.videoId) return 0;
      if (state.status !== 'playing') {
        return state.positionSec || 0;
      }
      const serverNow = Date.now() + serverOffsetMs;
      const elapsedSec = Math.max(0, (serverNow - (state.serverUpdatedAtMs || serverNow)) / 1000);
      return (state.positionSec || 0) + elapsedSec;
    },
    [playerState, serverOffsetMs]
  );

  // 2. Handle Server player:state broadcast
  useEffect(() => {
    if (!socket) return;

    const handlePlayerState = async (remoteState) => {
      setPlayerState(remoteState);

      const player = playerRef.current;
      if (!player || !isPlayerReady) return;

      isApplyingRemoteChange.current = true;

      try {
        // Change video if different
        const currentVideoUrl = (await player.getVideoUrl?.()) || '';
        const currentVideoId = currentVideoUrl.includes('v=')
          ? currentVideoUrl.split('v=')[1]?.split('&')[0]
          : '';

        if (remoteState.videoId && currentVideoId !== remoteState.videoId) {
          await player.loadVideoById?.({
            videoId: remoteState.videoId,
            startSeconds: getExpectedPosition(remoteState),
          });
        }

        const expectedPos = getExpectedPosition(remoteState);
        const currentPos = (await player.getCurrentTime?.()) || 0;

        if (remoteState.status === 'playing') {
          if (Math.abs(currentPos - expectedPos) > DRIFT_THRESHOLD_SEC) {
            await player.seekTo?.(expectedPos, true);
          }
          await player.playVideo?.();
        } else if (remoteState.status === 'paused') {
          if (Math.abs(currentPos - remoteState.positionSec) > DRIFT_THRESHOLD_SEC) {
            await player.seekTo?.(remoteState.positionSec, true);
          }
          await player.pauseVideo?.();
        }
      } catch (err) {
        console.warn('[Sync] Failed applying remote player change:', err);
      } finally {
        setTimeout(() => {
          isApplyingRemoteChange.current = false;
        }, 300);
      }
    };

    socket.on('player:state', handlePlayerState);

    return () => {
      socket.off('player:state', handlePlayerState);
    };
  }, [socket, playerRef, isPlayerReady, setPlayerState, getExpectedPosition]);

  // 3. Periodic Drift Correction (Only when drift > 1.5s while playing)
  useEffect(() => {
    if (!isPlayerReady) return;

    syncIntervalRef.current = setInterval(async () => {
      if (isApplyingRemoteChange.current) return;
      const player = playerRef.current;
      if (!player || playerState.status !== 'playing') return;

      try {
        const currentPos = (await player.getCurrentTime?.()) || 0;
        const expectedPos = getExpectedPosition();
        const drift = Math.abs(currentPos - expectedPos);

        if (drift > DRIFT_THRESHOLD_SEC) {
          isApplyingRemoteChange.current = true;
          await player.seekTo?.(expectedPos, true);
          setTimeout(() => {
            isApplyingRemoteChange.current = false;
          }, 300);
        }
      } catch {
        // ignore sync check error
      }
    }, 1500);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isPlayerReady, playerRef, playerState.status, getExpectedPosition]);

  // Client actions emitted to server
  const emitPlay = useCallback(async () => {
    if (!socket || isApplyingRemoteChange.current) return;
    const player = playerRef.current;
    const pos = (await player?.getCurrentTime?.()) || 0;
    socket.emit('player:play', { positionSec: pos });
  }, [socket, playerRef]);

  const emitPause = useCallback(async () => {
    if (!socket || isApplyingRemoteChange.current) return;
    const player = playerRef.current;
    const pos = (await player?.getCurrentTime?.()) || 0;
    socket.emit('player:pause', { positionSec: pos });
  }, [socket, playerRef]);

  const emitSeek = useCallback(
    (positionSec) => {
      if (!socket || isApplyingRemoteChange.current) return;
      socket.emit('player:seek', { positionSec });
    },
    [socket]
  );

  const emitSetVideo = useCallback(
    (videoId) => {
      if (!socket) return;
      socket.emit('player:set-video', { videoId });
    },
    [socket]
  );

  return {
    emitPlay,
    emitPause,
    emitSeek,
    emitSetVideo,
    isApplyingRemoteChange,
    getExpectedPosition,
  };
}


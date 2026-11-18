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

  // Helper to fetch current player position quickly without blocking on postMessage
  const getFastCurrentTime = useCallback(async (fallback = 0) => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return fallback;
    try {
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(fallback), 80));
      const pos = await Promise.race([player.getCurrentTime(), timeoutPromise]);
      return typeof pos === 'number' && !isNaN(pos) ? pos : fallback;
    } catch {
      return fallback;
    }
  }, [playerRef]);

  // Client actions emitted to server (optimistic local execution prevents dropped clicks & satisfies autoplay policy)
  const emitPlay = useCallback(async () => {
    isApplyingRemoteChange.current = false;
    const player = playerRef.current;

    // Immediately trigger local playback within user click context
    try {
      player?.playVideo?.();
    } catch {}

    const fallbackPos = playerState.positionSec || 0;
    const pos = await getFastCurrentTime(fallbackPos);

    setPlayerState({
      ...playerState,
      status: 'playing',
      positionSec: pos,
    });

    if (socket) {
      socket.emit('player:play', { positionSec: pos });
    }
  }, [socket, playerRef, playerState, setPlayerState, getFastCurrentTime]);

  const emitPause = useCallback(async () => {
    isApplyingRemoteChange.current = false;
    const player = playerRef.current;

    // Immediately trigger local pause
    try {
      player?.pauseVideo?.();
    } catch {}

    const fallbackPos = playerState.positionSec || 0;
    const pos = await getFastCurrentTime(fallbackPos);

    setPlayerState({
      ...playerState,
      status: 'paused',
      positionSec: pos,
    });

    if (socket) {
      socket.emit('player:pause', { positionSec: pos });
    }
  }, [socket, playerRef, playerState, setPlayerState, getFastCurrentTime]);

  const emitSeek = useCallback(
    (positionSec) => {
      isApplyingRemoteChange.current = false;
      const player = playerRef.current;
      try {
        player?.seekTo?.(positionSec, true);
      } catch {}

      setPlayerState({
        ...playerState,
        positionSec,
      });

      if (socket) {
        socket.emit('player:seek', { positionSec });
      }
    },
    [socket, playerRef, playerState, setPlayerState]
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


import React from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Search } from 'lucide-react';
import { formatTime } from '../services/youtube';

/**
 * Minimalist playback overlay & scrub controls for the synchronized YouTube player.
 */
export default function PlaybackOverlay({
  currentTrack,
  isPlaying,
  playbackPosition = 0,
  duration = 0,
  isMuted = false,
  onTogglePlay,
  onSkip,
  onSeek,
  onToggleMute,
  onOpenSearch
}) {
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const [scrubPosition, setScrubPosition] = React.useState(0);

  const displayPosition = isScrubbing ? scrubPosition : playbackPosition;

  const handleSliderChange = (e) => {
    setScrubPosition(Number(e.target.value));
  };

  const handleSliderDown = () => {
    setIsScrubbing(true);
  };

  const handleSliderUp = () => {
    setIsScrubbing(false);
    if (onSeek) onSeek(scrubPosition);
  };

  if (!currentTrack) {
    return (
      <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-5 text-center select-none shadow-lg">
        <p className="text-xs text-[#9A978F] mb-3">No music currently playing in the room.</p>
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:opacity-95 text-white font-semibold rounded-xl text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search or Paste a YouTube Track</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-4 select-none space-y-3 shadow-xl">
      {/* Current Track Info */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[#FF9F1C] font-bold">Now Playing</span>
            {isPlaying && (
              <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live Sync
              </span>
            )}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">{currentTrack.title}</h3>
          <p className="text-xs text-[#9A978F] truncate">{currentTrack.channelTitle || 'YouTube'}</p>
        </div>

        {/* Quick Mute Toggle */}
        {onToggleMute && (
          <button
            type="button"
            onClick={onToggleMute}
            className={`p-2 rounded-xl border transition-all cursor-pointer active:scale-95 ${
              isMuted
                ? 'bg-red-500/15 border-red-500/30 text-red-300'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
            }`}
            title={isMuted ? 'Unmute music' : 'Mute music'}
            aria-label={isMuted ? 'Unmute music' : 'Mute music'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Scrub bar */}
      <div className="space-y-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min="0"
            max={duration > 0 ? Math.floor(duration) : 100}
            value={Math.min(displayPosition, duration > 0 ? duration : 100)}
            onChange={handleSliderChange}
            onPointerDown={handleSliderDown}
            onPointerUp={handleSliderUp}
            className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[#FF9F1C]"
          />
        </div>
        <div className="flex justify-between text-[11px] font-mono text-[#9A978F]">
          <span>{formatTime(displayPosition)}</span>
          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-4 pt-1">
        <button
          type="button"
          onClick={onTogglePlay}
          className="w-12 h-12 rounded-full bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:opacity-95 text-white flex items-center justify-center shadow-lg shadow-[#FF5A5F]/25 active:scale-95 transition-all cursor-pointer"
          aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center border border-white/10 active:scale-95 transition-all cursor-pointer"
          aria-label="Skip to next track"
          title="Skip to next track"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

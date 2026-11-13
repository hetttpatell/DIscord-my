import React from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import { formatTime } from '../services/youtube';

/**
 * Minimalist playback overlay & scrub controls for the synchronized YouTube player.
 */
export default function PlaybackOverlay({
  currentTrack,
  isPlaying,
  playbackPosition,
  duration = 0,
  onTogglePlay,
  onSkip,
  onSeek
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
    onSeek(scrubPosition);
  };

  if (!currentTrack) {
    return (
      <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-4 text-center select-none">
        <p className="text-xs text-[#9A978F]">No music currently playing. Search or paste a link to start.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-4 select-none space-y-3">
      {/* Current Track Info */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-[#FF9F1C] font-bold">Now Playing</div>
          <h3 className="text-sm sm:text-base font-bold text-white truncate">{currentTrack.title}</h3>
          <p className="text-xs text-[#9A978F] truncate mt-0.5">{currentTrack.channelTitle || 'YouTube'}</p>
        </div>
      </div>

      {/* Scrub bar */}
      <div className="space-y-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min="0"
            max={duration > 0 ? Math.floor(duration) : 100}
            value={displayPosition}
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
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

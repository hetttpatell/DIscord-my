import React from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Subtitles } from 'lucide-react';
import { Slider } from '../../components/Slider';
import { Button } from '../../components/Button';
import { cn } from '../../lib/utils';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  isFullscreen = false,
  onToggleFullscreen,
  isCaptionsEnabled = false,
  onToggleCaptions,
  className = '',
  onUserInteraction,
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onUserInteraction?.();
      }}
      onTouchStart={onUserInteraction}
      onPointerDown={onUserInteraction}
      className={cn(
        'w-full bg-[#141419]/90 border-t border-white/10 px-4 py-2.5 backdrop-blur-md flex flex-col gap-2',
        className
      )}
    >
      {/* Seek bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#9A978F] tabular-nums font-mono min-w-[36px]">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.5}
            onValueChange={([val]) => onSeek(val)}
            aria-label="Seek track position"
          />
        </div>
        <span className="text-xs text-[#9A978F] tabular-nums font-mono min-w-[36px] text-right">
          {formatTime(duration)}
        </span>
      </div>

      {/* Action buttons and volume */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onPlayPause?.();
            }}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
            className="text-[#FF9F1C] hover:bg-white/10 active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
          </Button>
        </div>

        {/* Volume controls, Captions & Fullscreen toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 max-w-[150px] w-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleMute}
              aria-label={isMuted ? 'Unmute volume' : 'Mute volume'}
              className="text-[#9A978F] hover:text-[#F4F1EA]"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-[#FF5A5F]" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              min={0}
              max={100}
              step={1}
              onValueChange={([val]) => onVolumeChange(val)}
              aria-label="Volume level"
              className="w-16 sm:w-20"
            />
          </div>

          {onToggleCaptions && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCaptions();
              }}
              aria-label={isCaptionsEnabled ? 'Turn captions off' : 'Turn captions on'}
              title={isCaptionsEnabled ? 'Captions (c) - On' : 'Captions (c) - Off'}
              className={cn(
                'relative text-[#9A978F] hover:text-[#F4F1EA] shrink-0 transition-colors',
                isCaptionsEnabled && 'text-[#FF9F1C] hover:text-[#ffb042]'
              )}
            >
              <Subtitles className="w-4 h-4" />
              {isCaptionsEnabled && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-0.5 bg-[#FF9F1C] rounded-full" />
              )}
            </Button>
          )}

          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              className="text-[#9A978F] hover:text-[#F4F1EA] shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-[#FF9F1C]" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlayerControls;


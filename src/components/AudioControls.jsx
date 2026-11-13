import React from 'react';
import { Music, Users } from 'lucide-react';

/**
 * Dual Volume Sliders for Music and Room Voices
 * - "Music" controls YouTube volume (ducked automatically when remote members speak)
 * - "Voices" controls remote participant audio playback level
 */
export default function AudioControls({
  musicVolume = 80,
  voicesVolume = 100,
  onMusicVolumeChange,
  onVoicesVolumeChange
}) {
  return (
    <div className="w-full bg-[#141419]/90 border border-white/10 rounded-2xl p-3.5 select-none space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold text-[#9A978F] px-1">
        <span>Audio Balance</span>
        <span className="text-[10px] text-white/40">Music Ducking Active</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Music Volume Slider */}
        <div className="flex items-center gap-2.5 bg-white/5 p-2 rounded-xl border border-white/5">
          <Music className="w-4 h-4 text-[#FF9F1C] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-[11px] font-medium text-white/80 mb-1">
              <span>Music</span>
              <span className="font-mono text-white/50">{musicVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={musicVolume}
              onChange={(e) => onMusicVolumeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF9F1C]"
            />
          </div>
        </div>

        {/* Voices Volume Slider */}
        <div className="flex items-center gap-2.5 bg-white/5 p-2 rounded-xl border border-white/5">
          <Users className="w-4 h-4 text-[#FF5A5F] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-[11px] font-medium text-white/80 mb-1">
              <span>Voices</span>
              <span className="font-mono text-white/50">{voicesVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={voicesVolume}
              onChange={(e) => onVoicesVolumeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF5A5F]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import {
  VOICE_PRESETS,
  getCurrentVoicePreset,
  setVoicePreset,
  setVoiceMonitor,
  isVoiceMonitorActive,
} from '../../lib/voiceEffects';
import { Sparkles, Check, Headphones, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

export function VoiceEffectsSheet({ open, onOpenChange, currentPreset, onSelectPreset }) {
  const activePreset = currentPreset || getCurrentVoicePreset();
  const [isMonitoring, setIsMonitoring] = useState(isVoiceMonitorActive());

  const handleSelect = (preset) => {
    setVoicePreset(preset.id);
    if (onSelectPreset) {
      onSelectPreset(preset.id);
    }
    toast.success(`Voice set to: ${preset.name} ${preset.emoji}`);
  };

  const handleToggleMonitor = () => {
    const nextState = !isMonitoring;
    setIsMonitoring(nextState);
    setVoiceMonitor(nextState);
    if (nextState) {
      toast.info('Headphone monitor active: Speak to hear your own effect!', {
        icon: '🎧',
      });
    } else {
      toast.info('Headphone monitor turned off');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && isMonitoring) {
          // Auto-disable monitor on close to prevent feedback
          setIsMonitoring(false);
          setVoiceMonitor(false);
        }
        onOpenChange?.(isOpen);
      }}
      title="Microphone Voice Changer"
      description="Real-time studio DSP effects applied before broadcasting to the room"
      className="max-w-lg mx-auto"
    >
      <div className="flex flex-col gap-3 pb-4 pt-1">
        {/* Top Monitor / Test Bar */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1C1C24] border border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-[#FF9F1C]" />
            <div className="flex flex-col">
              <span className="font-semibold text-[#F4F1EA]">Test Voice in Headphones</span>
              <span className="text-[10px] text-[#9A978F]">Hear yourself live with the selected effect</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleMonitor}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              isMonitoring
                ? 'bg-[#2EC4B6] text-[#0B0B10] shadow-md shadow-[#2EC4B6]/20'
                : 'bg-white/5 hover:bg-white/10 text-[#9A978F] border border-white/10'
            }`}
          >
            {isMonitoring ? (
              <>
                <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                Listening
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                Test Off
              </>
            )}
          </button>
        </div>

        {/* DSP Badge */}
        <div className="flex items-center gap-2 px-1 text-xs text-[#9A978F]">
          <Sparkles className="w-3.5 h-3.5 text-[#FF9F1C]" />
          <span>9 Professional audio effects • Live zero-latency DSP</span>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {VOICE_PRESETS.map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelect(preset)}
                className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#FF9F1C]/20 border-[#FF9F1C] shadow-lg shadow-[#FF9F1C]/15 text-white ring-1 ring-[#FF9F1C]'
                    : 'bg-[#1C1C24] border-white/10 hover:border-white/20 hover:bg-[#252530] text-[#F4F1EA]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-2xl">{preset.emoji}</span>
                  {isSelected && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#FF9F1C] text-[#0B0B10]">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold font-sans tracking-tight">{preset.name}</span>
                <span className="text-[10px] text-[#9A978F] line-clamp-2 mt-0.5 leading-snug">
                  {preset.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

export default VoiceEffectsSheet;

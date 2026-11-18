import React from 'react';
import { Sheet } from '../../components/Sheet';
import { VOICE_PRESETS, getCurrentVoicePreset, setVoicePreset } from '../../lib/voiceEffects';
import { Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';

export function VoiceEffectsSheet({ open, onOpenChange, currentPreset, onSelectPreset }) {
  const activePreset = currentPreset || getCurrentVoicePreset();

  const handleSelect = (preset) => {
    setVoicePreset(preset.id);
    if (onSelectPreset) {
      onSelectPreset(preset.id);
    }
    toast.success(`Voice effect: ${preset.name} ${preset.emoji}`);
    onOpenChange?.(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Microphone Voice Changer"
      description="Apply real-time audio effects to your voice for the entire room"
      className="max-w-md mx-auto"
    >
      <div className="flex flex-col gap-2.5 pb-4 pt-1">
        <div className="flex items-center gap-2 px-1 text-xs text-[#9A978F]">
          <Sparkles className="w-3.5 h-3.5 text-[#FF9F1C]" />
          <span>Processed live using Web Audio DSP before broadcasting</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          {VOICE_PRESETS.map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelect(preset)}
                className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#FF9F1C]/15 border-[#FF9F1C] shadow-lg shadow-[#FF9F1C]/10 text-white'
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
                <span className="text-[10px] text-[#9A978F] line-clamp-1 mt-0.5">{preset.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

export default VoiceEffectsSheet;

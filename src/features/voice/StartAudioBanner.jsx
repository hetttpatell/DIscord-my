import React from 'react';
import { useStartAudio } from '@livekit/components-react';
import { Volume2 } from 'lucide-react';
import { Button } from '../../components/Button';

export function StartAudioBanner() {
  const { canPlayAudio, mergedProps } = useStartAudio({
    label: 'Tap to enable sound',
  });

  if (canPlayAudio) {
    return null;
  }

  return (
    <div className="fixed top-16 left-4 right-4 z-40 max-w-md mx-auto p-3 rounded-2xl bg-[#FF9F1C] text-[#0B0B10] shadow-2xl flex items-center justify-between gap-3 animate-fade-in">
      <div className="flex items-center gap-2.5 min-w-0">
        <Volume2 className="w-5 h-5 shrink-0" />
        <span className="text-xs font-bold leading-tight">
          Sound blocked by browser. Tap to hear others.
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        {...mergedProps}
        className="bg-[#0B0B10] text-[#F4F1EA] hover:bg-black font-semibold text-xs whitespace-nowrap min-h-[36px]"
        aria-label="Tap to enable sound"
      >
        Enable Sound
      </Button>
    </div>
  );
}

export default StartAudioBanner;


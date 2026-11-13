import React from 'react';
import { Volume2, Play } from 'lucide-react';

/**
 * StartListeningGate Component
 * Visually prominent, warm banner/card explaining browser autoplay requirements.
 * Tapping grants user activation for both YouTube audio and WebRTC AudioContext.
 */
export default function StartListeningGate({ isVisible, onUnlock }) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none animate-fade-in">
      <div className="w-full max-w-sm bg-[#141419] border border-[#FF9F1C]/40 rounded-3xl p-6 shadow-2xl text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#FF9F1C]/20 to-[#FF5A5F]/20 border border-[#FF9F1C]/30 flex items-center justify-center text-[#FF9F1C] animate-pulse">
          <Volume2 className="w-7 h-7" />
        </div>

        <div>
          <h3 className="font-display font-bold text-lg text-[#F4F1EA]">
            Ready to listen?
          </h3>
          <p className="text-xs text-[#9A978F] mt-1.5 leading-relaxed">
            Your browser requires one tap to enable synchronized YouTube playback and real-time voice audio.
          </p>
        </div>

        <button
          type="button"
          onClick={onUnlock}
          className="w-full min-h-[48px] py-3 px-6 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:opacity-95 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-xl shadow-[#FF5A5F]/30 active:scale-95 transition-all cursor-pointer"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Tap to start listening</span>
        </button>
      </div>
    </div>
  );
}


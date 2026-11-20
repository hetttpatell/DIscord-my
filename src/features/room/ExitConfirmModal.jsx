import React, { useEffect } from 'react';
import { LogOut, X, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button';

export function ExitConfirmModal({ isOpen, onConfirm, onCancel }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      aria-describedby="exit-modal-desc"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-[#141419]/95 border border-white/15 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl text-center flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200 cursor-default"
      >
        {/* Close X button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Warning Icon with Amber/Coral Pulse Badge */}
        <div className="w-13 h-13 rounded-2xl bg-[#FF5A5F]/15 border border-[#FF5A5F]/30 flex items-center justify-center text-[#FF5A5F] shadow-inner shadow-[#FF5A5F]/20">
          <AlertTriangle className="w-6 h-6 animate-pulse" />
        </div>

        {/* Text Content */}
        <div className="space-y-1.5">
          <h2
            id="exit-modal-title"
            className="text-lg font-bold text-[#F4F1EA] tracking-tight font-display"
          >
            Leave Lounge?
          </h2>
          <p
            id="exit-modal-desc"
            className="text-xs text-[#9A978F] leading-relaxed max-w-xs"
          >
            You will be disconnected from the live stream, group voice, video, and party games.
          </p>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="w-full text-xs font-semibold py-2.5 bg-white/10 hover:bg-white/15 text-[#F4F1EA] border border-white/10 rounded-xl"
          >
            Stay in Room
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="w-full text-xs font-bold py-2.5 bg-[#FF5A5F] hover:bg-[#FF4147] text-white rounded-xl shadow-lg shadow-[#FF5A5F]/25 flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ExitConfirmModal;

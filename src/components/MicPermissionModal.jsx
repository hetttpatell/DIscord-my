import React from 'react';
import { MicOff, RefreshCw, X } from 'lucide-react';

/**
 * Microphone Permission & Blocked Guidance Modal
 * Provides exact platform-specific instructions for Chrome Android, Safari iOS, and Desktop Chrome.
 */
export default function MicPermissionModal({ isOpen, onClose, onRetry }) {
  if (!isOpen) return null;

  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-sm bg-[#141419] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <MicOff className="w-5 h-5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="font-bold text-base text-white">Microphone Access Needed</h3>
          <p className="text-xs text-white/60 mt-1">
            Your browser blocked microphone access. Follow these instructions to allow it:
          </p>
        </div>

        {/* Platform-specific instructions */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 text-xs text-white/80 space-y-2">
          {isIOS ? (
            <>
              <div className="font-semibold text-[#FF9F1C]">Safari on iOS:</div>
              <ol className="list-decimal list-inside space-y-1 text-white/70">
                <li>Tap the <strong>aA</strong> or page icon on the left of the URL bar.</li>
                <li>Tap <strong>Website Settings</strong>.</li>
                <li>Set <strong>Microphone</strong> to <strong>Allow</strong>.</li>
                <li>Or open <strong>Settings &gt; Safari &gt; Microphone</strong>.</li>
              </ol>
            </>
          ) : isAndroid ? (
            <>
              <div className="font-semibold text-[#FF9F1C]">Chrome on Android:</div>
              <ol className="list-decimal list-inside space-y-1 text-white/70">
                <li>Tap the <strong>lock/tune</strong> icon on the left of the address bar.</li>
                <li>Tap <strong>Permissions</strong> (or Site Settings).</li>
                <li>Toggle <strong>Microphone</strong> to <strong>Allowed</strong>.</li>
              </ol>
            </>
          ) : (
            <>
              <div className="font-semibold text-[#FF9F1C]">Desktop Chrome / Edge / Brave:</div>
              <ol className="list-decimal list-inside space-y-1 text-white/70">
                <li>Click the <strong>tune/padlock icon</strong> next to the URL in the address bar.</li>
                <li>Set <strong>Microphone</strong> permission to <strong>Allow</strong>.</li>
                <li>Reload or click Retry below.</li>
              </ol>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:opacity-95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white/70 rounded-xl text-xs font-medium active:scale-95 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


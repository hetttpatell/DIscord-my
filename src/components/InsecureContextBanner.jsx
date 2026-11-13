import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function InsecureContextBanner({ isSecureContext: propIsSecure } = {}) {
  const [dismissed, setDismissed] = useState(false);

  // Directly evaluate window.isSecureContext or undefined navigator.mediaDevices
  const isInsecure = typeof window !== 'undefined'
    ? (!window.isSecureContext || typeof navigator === 'undefined' || !navigator.mediaDevices)
    : (propIsSecure !== undefined ? !propIsSecure : false);

  if (!isInsecure || dismissed) return null;

  return (
    <div className="fixed top-14 left-4 right-4 max-w-lg mx-auto z-50 bg-[#FF9F1C] text-black px-4 py-3 rounded-2xl shadow-2xl border border-white/20 text-xs animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-sm mb-0.5">Microphone Notice (Insecure Context)</span>
            <p className="leading-relaxed text-[11px] opacity-90">
              Browsers block microphone access on unencrypted HTTP connections.
            </p>
            <p className="mt-1 text-[11px] opacity-90">
              Please connect via HTTPS or localhost to enable voice communication.
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg hover:bg-black/10 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4 text-black" />
        </button>
      </div>
    </div>
  );
}

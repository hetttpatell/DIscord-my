import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

export default function InsecureContextBanner({ isSecureContext: propIsSecure } = {}) {
  const [dismissed, setDismissed] = useState(false);

  // Directly evaluate window.isSecureContext or undefined navigator.mediaDevices
  const isInsecure = typeof window !== 'undefined'
    ? (!window.isSecureContext || typeof navigator === 'undefined' || !navigator.mediaDevices)
    : (propIsSecure !== undefined ? !propIsSecure : false);

  if (!isInsecure || dismissed) return null;

  const canSwitchToHttps = typeof window !== 'undefined' && window.location.protocol === 'http:';

  const handleSwitchToHttps = () => {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.href.replace(/^http:/, 'https:');
    }
  };

  return (
    <div className="fixed top-14 left-4 right-4 max-w-lg mx-auto z-50 bg-gradient-to-r from-amber-500 to-orange-500 text-black px-4 py-3.5 rounded-2xl shadow-2xl border border-white/30 text-xs animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="font-bold block text-sm leading-tight text-black">
              Microphone Requires HTTPS on Mobile
            </span>
            <p className="leading-relaxed text-[11px] font-medium text-black/85 mt-1">
              Mobile browsers (iOS Safari & Android Chrome) disable microphone hardware on unencrypted HTTP connections.
            </p>

            {canSwitchToHttps && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSwitchToHttps}
                  className="px-3 py-1.5 bg-black text-white hover:bg-black/90 active:scale-95 font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Switch to HTTPS (Fixes Mic)</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg hover:bg-black/10 active:bg-black/20 transition-colors flex-shrink-0"
          title="Dismiss"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4 text-black" />
        </button>
      </div>
    </div>
  );
}

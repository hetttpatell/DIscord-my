import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function InsecureContextBanner({ isSecureContext: propIsSecure }) {
  const [dismissed, setDismissed] = useState(false);

  // Directly evaluate window.isSecureContext
  const isSecure = typeof window !== 'undefined'
    ? (window.isSecureContext !== undefined ? Boolean(window.isSecureContext) : Boolean(propIsSecure))
    : Boolean(propIsSecure);

  // If already secure context (https:// or localhost), don't show
  if (isSecure || dismissed) return null;

  return (
    <div className="fixed top-14 left-4 right-4 max-w-lg mx-auto z-50 bg-[#f2994a]/95 backdrop-blur-md text-black px-4 py-3 rounded-xl shadow-2xl border border-white/20 text-xs animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-sm mb-0.5">Mobile Camera/Mic Notice (HTTP)</span>
            <p className="leading-relaxed text-[11px] opacity-90">
              Mobile Chrome & Safari block camera and mic access on LAN HTTP addresses (<span className="font-mono">{typeof window !== 'undefined' ? window.location.hostname : 'IP'}</span>).
            </p>
            <p className="mt-1 text-[11px] opacity-90">
              To enable camera & mic on your phone, test over HTTPS using a cloudflared tunnel (<code className="font-mono font-bold">cloudflared tunnel --url https://localhost:5173 --no-tls-verify</code>), or on Android Chrome enable <span className="font-mono font-bold">chrome://flags/#unsafely-treat-insecure-origin-as-secure</span>.
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


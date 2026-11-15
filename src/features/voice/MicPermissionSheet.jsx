import React from 'react';
import { RefreshCw, Smartphone, Monitor, ShieldAlert } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';

export function MicPermissionSheet({ open, onOpenChange, errorInfo, onTryAgain }) {
  const errorName = errorInfo?.name || 'NotAllowedError';
  const errorMessage = errorInfo?.message || '';
  const errorType = errorInfo?.type || 'site_settings';

  let title = 'Microphone Access Required';
  let description = 'Please allow microphone access to talk in this lounge.';

  if (errorType === 'android_system') {
    title = 'Android System Blocked';
    description = 'Android is blocking the microphone for Chrome.';
  } else if (errorType === 'dismissed') {
    title = 'Permission Dismissed';
    description = 'You closed the permission popup.';
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="space-y-4 py-2 select-none">
        {/* Case A: Android System Denial */}
        {errorType === 'android_system' && (
          <div className="p-3.5 rounded-xl bg-[#FF5A5F]/10 border border-[#FF5A5F]/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FF5A5F]">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Android Blocking Chrome</span>
            </div>
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              Chrome is allowed on this site, but Android is blocking the microphone for Chrome.
            </p>
            <div className="p-2.5 rounded-lg bg-[#0B0B10]/60 border border-white/5 text-[11px] text-[#9A978F] space-y-1">
              <div>
                1. Open <strong>Android Settings</strong> → <strong>Apps</strong> → <strong>Chrome</strong> → <strong>Permissions</strong> → <strong>Microphone</strong> → <strong>Allow</strong>.
              </div>
              <div>
                2. Also make sure <strong>Settings</strong> → <strong>Privacy</strong> → <strong>Microphone access</strong> is turned on.
              </div>
            </div>
          </div>
        )}

        {/* Case B: User dismissed popup */}
        {errorType === 'dismissed' && (
          <div className="p-3.5 rounded-xl bg-[#FF9F1C]/10 border border-[#FF9F1C]/20 space-y-2">
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              You closed the permission popup. Tap <strong>Try again</strong> and choose <strong>Allow</strong>.
            </p>
          </div>
        )}

        {/* Case C: Site settings denied (default NotAllowedError) */}
        {errorType === 'site_settings' && (
          <div className="space-y-3">
            {/* Android Chrome Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#FF9F1C]">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android Chrome</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Tap the tune/lock icon in the URL bar → <strong>Site settings</strong> → <strong>Microphone</strong> → Select <strong>Allow</strong>.
              </p>
              <p className="text-[11px] text-[#FF9F1C]/80 pt-0.5">
                If it still fails: Android Settings → Apps → Chrome → Permissions → Microphone → Allow.
              </p>
            </div>

            {/* iOS Safari Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2EC4B6]">
                <Smartphone className="w-3.5 h-3.5" />
                <span>iOS Safari</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Tap the <strong>aA</strong> icon in the address bar → <strong>Website Settings</strong> → <strong>Microphone</strong> → Select <strong>Allow</strong>.
              </p>
            </div>

            {/* Desktop Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F1EA]">
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop (Chrome, Edge, Firefox, Safari)</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Click the lock or settings icon next to the URL in your address bar and toggle <strong>Microphone</strong> to <strong>Allow</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex gap-2">
          {onTryAgain && (
            <Button
              variant="primary"
              onClick={() => {
                onOpenChange(false);
                onTryAgain();
              }}
              className="flex-1 gap-2 font-semibold"
              aria-label="Try enabling microphone again"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            aria-label="Close microphone permission guide"
          >
            Dismiss
          </Button>
        </div>

        {/* Monospace Error Detail Line */}
        <div className="pt-1 text-center">
          <span className="font-mono text-[10px] text-white/40">
            Error: {errorName}{errorMessage ? ` - ${errorMessage}` : ''}
          </span>
        </div>
      </div>
    </Sheet>
  );
}

export default MicPermissionSheet;

import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw, Smartphone, Monitor, Copy, Globe } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { toast } from 'sonner';
import { subscribeToPermissionChange } from '../../lib/microphone';

export function MicPermissionSheet({ open, onOpenChange, errorInfo, onTryAgain }) {
  const reason = errorInfo?.reason;
  const errorName = errorInfo?.name;
  const errorMessage = errorInfo?.message;

  // Auto-dismiss when permission state changes to 'granted' in site settings
  useEffect(() => {
    if (!open) return;

    const unsubscribe = subscribeToPermissionChange(() => {
      onOpenChange(false);
      if (onTryAgain) {
        onTryAgain();
      }
    });

    return unsubscribe;
  }, [open, onOpenChange, onTryAgain]);

  let title = 'Microphone Access Required';
  let description = 'Please allow microphone access to talk in this lounge.';

  if (reason === 'in_app_browser') {
    title = 'Browser Not Supported';
    description = 'In-app browsers (Instagram, WhatsApp, etc.) do not allow microphone access.';
  } else if (reason === 'not_found') {
    title = 'No Microphone Found';
    description = 'No audio input device was detected on your device. Please plug in a microphone or headset.';
  } else if (reason === 'in_use') {
    title = 'Microphone In Use';
    description = 'Microphone is being used by another app or tab. Close it and try again.';
  } else if (reason === 'security') {
    title = 'Security Policy Blocked';
    description = 'Microphone access is blocked by the page security policy.';
  } else if (reason === 'insecure') {
    title = 'HTTPS Connection Required';
    description = 'Microphone needs a secure (HTTPS) page.';
  }

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Link copied to clipboard!');
      }
    } catch {
      toast.error('Failed to copy link.');
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="space-y-4 py-2 select-none">
        {/* In-App Browser Warning */}
        {reason === 'in_app_browser' && (
          <div className="p-4 rounded-xl bg-[#FF9F1C]/10 border border-[#FF9F1C]/20 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FF9F1C]">
              <Globe className="w-4 h-4" />
              <span>In-App Browser Detected</span>
            </div>
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              Open this link in Chrome or Safari to use the microphone.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCopyLink}
              className="w-full gap-2 text-xs font-semibold"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy room link
            </Button>
          </div>
        )}

        {/* Site Settings / Permission Denied Instructions */}
        {reason === 'denied' && (
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

        {/* Other Specific Error Message Banner */}
        {reason !== 'denied' && reason !== 'in_app_browser' && (
          <div className="p-4 rounded-xl bg-[#FF5A5F]/10 border border-[#FF5A5F]/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#FF5A5F] shrink-0 mt-0.5" />
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              {errorMessage || description}
            </p>
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
        {errorName && (
          <div className="pt-1 text-center">
            <span className="font-mono text-[10px] text-white/40">
              Error: {errorName}
            </span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export default MicPermissionSheet;

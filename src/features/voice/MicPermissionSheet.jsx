import React from 'react';
import { AlertCircle, RefreshCw, Smartphone, Monitor } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';

export function MicPermissionSheet({ open, onOpenChange, errorType, onTryAgain }) {
  let title = 'Microphone Access Required';
  let description = 'Please allow microphone access to talk in this lounge.';

  if (errorType === 'NotFound') {
    title = 'No Microphone Found';
    description = 'No audio input device was detected on your device. Please plug in a microphone or headset.';
  } else if (errorType === 'NotReadable') {
    title = 'Microphone In Use';
    description = 'Your microphone is currently in use by another app (e.g. Zoom, Teams, or another tab).';
  } else if (errorType === 'Insecure') {
    title = 'HTTPS Connection Required';
    description = 'Microphone access is restricted by browsers to secure HTTPS connections or localhost.';
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="space-y-4 py-2 select-none">
        {errorType === 'PermissionDenied' && (
          <div className="space-y-3">
            {/* Android Chrome Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#FF9F1C]">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android Chrome</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Tap the tune/lock icon in the URL bar → <strong>Site settings</strong> → <strong>Microphone</strong> → Select <strong>Allow</strong>.
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

        {errorType !== 'PermissionDenied' && (
          <div className="p-4 rounded-xl bg-[#FF5A5F]/10 border border-[#FF5A5F]/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#FF5A5F] shrink-0 mt-0.5" />
            <p className="text-xs text-[#F4F1EA] leading-relaxed">{description}</p>
          </div>
        )}

        {/* Action Button */}
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
      </div>
    </Sheet>
  );
}

export default MicPermissionSheet;


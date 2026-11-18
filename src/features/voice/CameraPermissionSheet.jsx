import React from 'react';
import { RefreshCw, Smartphone, Monitor, ShieldAlert, CameraOff } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';

export function CameraPermissionSheet({ open, onOpenChange, errorInfo, onTryAgain }) {
  const errorName = errorInfo?.name || 'NotAllowedError';
  const errorMessage = errorInfo?.message || '';
  const errorType = errorInfo?.type || 'site_settings';

  let title = 'Camera Access Required';
  let description = 'Please allow camera access to share your live video in this lounge.';

  if (errorType === 'android_system') {
    title = 'Android System Blocked';
    description = 'Android OS is blocking the camera for Chrome.';
  } else if (errorType === 'in_use') {
    title = 'Camera Already In Use';
    description = 'Another app or browser tab is currently using your camera.';
  } else if (errorType === 'dismissed') {
    title = 'Permission Dismissed';
    description = 'You closed the permission prompt.';
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
              <span>Android Blocking Camera</span>
            </div>
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              Chrome is permitted on this site, but Android OS settings are blocking camera access for Chrome.
            </p>
            <div className="p-2.5 rounded-lg bg-[#0B0B10]/60 border border-white/5 text-[11px] text-[#9A978F] space-y-1">
              <div>
                1. Open <strong>Android Settings</strong> → <strong>Apps</strong> → <strong>Chrome</strong> → <strong>Permissions</strong> → <strong>Camera</strong> → <strong>Allow</strong>.
              </div>
              <div>
                2. Check <strong>Settings</strong> → <strong>Privacy</strong> → <strong>Camera access</strong> toggle is ON.
              </div>
            </div>
          </div>
        )}

        {/* Case B: Camera In Use by Another App */}
        {errorType === 'in_use' && (
          <div className="p-3.5 rounded-xl bg-[#FF9F1C]/10 border border-[#FF9F1C]/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FF9F1C]">
              <CameraOff className="w-4 h-4 shrink-0" />
              <span>Camera Locked</span>
            </div>
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              Another application (e.g. Zoom, Google Meet, WhatsApp, or camera app) is currently using your camera. Please close it and tap <strong>Try again</strong>.
            </p>
          </div>
        )}

        {/* Case C: User dismissed popup */}
        {errorType === 'dismissed' && (
          <div className="p-3.5 rounded-xl bg-[#FF9F1C]/10 border border-[#FF9F1C]/20 space-y-2">
            <p className="text-xs text-[#F4F1EA] leading-relaxed">
              You closed the camera permission popup. Tap <strong>Try again</strong> and select <strong>Allow</strong>.
            </p>
          </div>
        )}

        {/* Case D: Site settings denied (default NotAllowedError) */}
        {errorType === 'site_settings' && (
          <div className="space-y-3">
            {/* Android Chrome Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#FF9F1C]">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android Chrome</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Tap the tune/lock icon in your URL address bar → <strong>Site settings</strong> → <strong>Camera</strong> → Choose <strong>Allow</strong>.
              </p>
            </div>

            {/* iOS Safari Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2EC4B6]">
                <Smartphone className="w-3.5 h-3.5" />
                <span>iOS Safari</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Tap the <strong>aA</strong> icon in the address bar → <strong>Website Settings</strong> → <strong>Camera</strong> → Choose <strong>Allow</strong>.
              </p>
            </div>

            {/* Desktop Instructions */}
            <div className="p-3 rounded-xl bg-[#0B0B10] border border-white/5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F1EA]">
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop (Chrome, Edge, Firefox, Safari)</span>
              </div>
              <p className="text-xs text-[#9A978F]">
                Click the lock/tune icon next to the URL in your browser bar and toggle <strong>Camera</strong> to <strong>Allow</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Try Again Action Button */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="default"
            onClick={onTryAgain}
            className="w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-xl shadow-lg shadow-[#FF9F1C]/20"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </Button>
        </div>

        {/* Diagnostic info footer if error is specific */}
        {errorName !== 'NotAllowedError' && errorMessage && (
          <p className="text-[10px] text-center text-[#9A978F] font-mono break-all pt-1">
            Diagnostic: {errorName}: {errorMessage}
          </p>
        )}
      </div>
    </Sheet>
  );
}

import React from 'react';
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing } from 'lucide-react';

/**
 * CallModal Component
 * Prominent mobile-first dialog for incoming and outgoing voice calls.
 * Displays:
 * - Animated avatar & status indicator
 * - Caller / Callee details
 * - Accept & Reject buttons for incoming calls
 * - Cancel button for outgoing calls
 */
export default function CallModal({
  callState = 'idle',
  remoteUser = null,
  onAccept,
  onReject,
  onCancel
}) {
  if (callState !== 'ringing' && callState !== 'calling') {
    return null;
  }

  const isIncoming = callState === 'ringing';
  const name = remoteUser?.name || 'Member';
  const avatarColor = remoteUser?.avatarColor || '#5865f2';

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'M';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-sm bg-[#141419] border border-white/15 rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-6 relative overflow-hidden">
        {/* Ambient background glow */}
        <div
          className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20 ${
            isIncoming ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
        />
        <div
          className={`absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20 ${
            isIncoming ? 'bg-teal-500' : 'bg-orange-500'
          }`}
        />

        {/* Call Type Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-white/80">
          {isIncoming ? (
            <>
              <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              <span>Incoming Voice Call</span>
            </>
          ) : (
            <>
              <PhoneOutgoing className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Outgoing Voice Call...</span>
            </>
          )}
        </div>

        {/* User Avatar with pulsing rings */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full animate-ping opacity-30 ${
              isIncoming ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <div
            className={`absolute -inset-2 rounded-full border-2 ${
              isIncoming ? 'border-emerald-500/40' : 'border-amber-500/40'
            } animate-pulse`}
          />
          <div
            style={{ backgroundColor: avatarColor }}
            className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-xl border-2 border-white/20 relative z-10"
          >
            {initials}
          </div>
        </div>

        {/* User Details */}
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white tracking-tight">{name}</h3>
          <p className="text-xs text-white/60">
            {isIncoming ? 'Is calling you for a voice chat' : 'Waiting for answer...'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-2">
          {isIncoming ? (
            <div className="flex items-center justify-center gap-4">
              {/* Decline Button */}
              <button
                type="button"
                onClick={onReject}
                className="flex-1 py-3 px-4 rounded-2xl bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-400 border border-red-500/40 font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Decline</span>
              </button>

              {/* Accept Button */}
              <button
                type="button"
                onClick={onAccept}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all cursor-pointer ring-2 ring-emerald-400/40"
              >
                <Phone className="w-4 h-4" />
                <span>Accept</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              {/* Cancel Button */}
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-3 px-4 rounded-2xl bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-400 border border-red-500/40 font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Cancel Call</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

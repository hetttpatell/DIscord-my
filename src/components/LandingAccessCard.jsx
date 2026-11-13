import React from 'react';
import { ArrowRight, Music2, Shield, Users } from 'lucide-react';

/**
 * LandingAccessCard Component
 * Value Proposition: "Listen together. In sync. On mic. That's it."
 * Supports Create Room, Join Room, and Invite Landing mode (?room=<ID>).
 */
export default function LandingAccessCard({
  mode,
  onModeChange,
  userNameInput,
  onUserNameChange,
  roomIdInput,
  onRoomIdChange,
  roomNameInput,
  onRoomNameChange,
  passwordInput,
  onPasswordChange,
  onSubmitJoin,
  onSubmitCreate,
  errorMessage,
  isInviteMode
}) {
  return (
    <div className="w-full max-w-md mx-auto p-4 sm:p-6 flex flex-col justify-center select-none animate-fade-in">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-[#FF9F1C] mb-3">
          <Music2 className="w-3.5 h-3.5" />
          <span>Shared YouTube &amp; Mic-only Voice</span>
        </div>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-[#F4F1EA]">
          afterspot
        </h1>
        <p className="text-sm sm:text-base text-[#9A978F] mt-2 font-medium">
          Listen together. In sync. On mic. That’s it.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-[#141419] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5">
        {/* Invite notice when entering via invite link */}
        {isInviteMode && (
          <div className="p-3 bg-gradient-to-r from-[#FF9F1C]/15 to-[#FF5A5F]/15 border border-[#FF9F1C]/30 rounded-2xl flex items-center gap-2.5 text-xs text-white">
            <Users className="w-4 h-4 text-[#FF9F1C] shrink-0" />
            <span>You were invited to room <strong>{roomIdInput}</strong>! Enter your name and password to join.</span>
          </div>
        )}

        {/* Mode Toggle Tabs (Join vs Create) */}
        {!isInviteMode && (
          <div className="flex gap-1.5 p-1 bg-[#0B0B10] rounded-2xl border border-white/5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onModeChange('join')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'join'
                  ? 'bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white shadow-md'
                  : 'text-[#9A978F] hover:text-white'
              }`}
            >
              Join Room
            </button>
            <button
              type="button"
              onClick={() => onModeChange('create')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'create'
                  ? 'bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] text-white shadow-md'
                  : 'text-[#9A978F] hover:text-white'
              }`}
            >
              Create Room
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-2xl text-xs text-red-200 leading-relaxed animate-fade-in">
            {errorMessage}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={mode === 'join' ? onSubmitJoin : onSubmitCreate} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9A978F] mb-1.5 pl-1">
              Display Name
            </label>
            <input
              type="text"
              value={userNameInput}
              onChange={(e) => onUserNameChange(e.target.value)}
              placeholder="e.g. Alex"
              autoComplete="name"
              style={{ fontSize: '16px' }}
              className="w-full min-h-[48px] px-4 py-3 bg-[#0B0B10] border border-white/10 rounded-2xl text-[#F4F1EA] placeholder-white/25 focus:outline-none focus:border-[#FF9F1C] transition-colors"
              required
            />
          </div>

          {mode === 'join' ? (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9A978F] mb-1.5 pl-1">
                Room Code
              </label>
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => onRoomIdChange(e.target.value.toUpperCase())}
                placeholder="6-character code"
                maxLength={10}
                style={{ fontSize: '16px' }}
                className="w-full min-h-[48px] px-4 py-3 bg-[#0B0B10] border border-white/10 rounded-2xl text-[#F4F1EA] font-mono tracking-widest uppercase placeholder-white/25 focus:outline-none focus:border-[#FF9F1C] transition-colors"
                required
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9A978F] mb-1.5 pl-1">
                Room Name (Optional)
              </label>
              <input
                type="text"
                value={roomNameInput}
                onChange={(e) => onRoomNameChange(e.target.value)}
                placeholder="e.g. Chill Beats Lounge"
                style={{ fontSize: '16px' }}
                className="w-full min-h-[48px] px-4 py-3 bg-[#0B0B10] border border-white/10 rounded-2xl text-[#F4F1EA] placeholder-white/25 focus:outline-none focus:border-[#FF9F1C] transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9A978F] mb-1.5 pl-1">
              Room Password
            </label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Minimum 4 characters"
              minLength={4}
              style={{ fontSize: '16px' }}
              className="w-full min-h-[48px] px-4 py-3 bg-[#0B0B10] border border-white/10 rounded-2xl text-[#F4F1EA] placeholder-white/25 focus:outline-none focus:border-[#FF9F1C] transition-colors"
              required
            />
            <p className="text-[10px] text-[#9A978F] mt-1 pl-1">
              Passwords are never included in invite URLs.
            </p>
          </div>

          <button
            type="submit"
            className="w-full min-h-[50px] py-3 px-6 bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:opacity-95 text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 shadow-xl shadow-[#FF5A5F]/20 active:scale-[0.99] transition-all cursor-pointer"
          >
            <span>{mode === 'join' ? 'Enter Room' : 'Create Room & Get Code'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {isInviteMode && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => onModeChange('create')}
              className="text-xs text-[#9A978F] hover:text-white underline underline-offset-4 transition-colors"
            >
              Or create your own room instead
            </button>
          </div>
        )}
      </div>

      {/* Feature Footnote */}
      <div className="flex items-center justify-center gap-6 mt-6 text-xs text-[#9A978F]">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-[#2EC4B6]" />
          <span>Encrypted Voice</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#2EC4B6]" />
          <span>Zero Video Calling</span>
        </div>
      </div>
    </div>
  );
}


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Radio } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { apiRequest } from '../../lib/api';
import { useAppStore } from '../../stores/useAppStore';
import { saveRoomCredentials } from '../../lib/roomStorage';

export function InRoomJoinCard({ roomId, defaultDisplayName = '', onJoined }) {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);

  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(
    () => defaultDisplayName || (typeof window !== 'undefined' ? localStorage.getItem('afterspot_displayName') || '' : '')
  );
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    if (!password) {
      setError('Password is required');
      return;
    }
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Display name is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const data = await apiRequest('/api/rooms/join', {
        method: 'POST',
        body: {
          roomId: roomId.trim(),
          password,
          displayName: trimmedName,
        },
      });

      setSession({
        token: data.token,
        roomId: data.roomId,
        memberId: data.memberId,
        displayName: data.displayName,
      });

      saveRoomCredentials({
        roomId: data.roomId,
        token: data.token,
        memberId: data.memberId,
        displayName: data.displayName,
        password,
      });

      if (data.welcomeMessage) {
        useAppStore.getState().setWelcomeMessage(data.welcomeMessage, data.displayName);
      }

      toast.success('Joined room!');
      onJoined?.(data);
    } catch (err) {
      const msg = err.message || 'Failed to join room';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-full flex items-center justify-center p-4 bg-[#0B0B10] text-[#F4F1EA] select-none">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#FF9F1C]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-72 h-72 bg-[#2EC4B6]/5 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-[#141419]/95 border border-white/10 p-7 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)]">
        {/* Top Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF9F1C] to-[#FF5A5F] flex items-center justify-center shadow-lg shadow-[#FF9F1C]/25 mb-3.5">
            <Radio className="w-6 h-6 text-[#0B0B10]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-[#F4F1EA] mb-2">
            <Lock className="w-3 h-3 text-[#FF9F1C]" />
            <span>Room: <strong className="text-white">{roomId}</strong></span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-[#F4F1EA] font-display">
            Enter Room Passcode
          </h1>
          <p className="text-xs text-[#9A978F] mt-1">
            This lounge requires a password to participate.
          </p>
        </div>

        {/* Passcode Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Display Name */}
          <div>
            <label
              htmlFor="join-displayName"
              className="block text-xs font-medium text-[#9A978F] mb-1.5"
            >
              Display Name
            </label>
            <Input
              id="join-displayName"
              type="text"
              placeholder="Your nickname"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (error) setError('');
              }}
              disabled={isLoading}
              maxLength={24}
              className="text-xs h-10"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="join-password"
              className="block text-xs font-medium text-[#9A978F] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Input
                id="join-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter room password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                disabled={isLoading}
                className="text-xs h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-[#9A978F] hover:text-[#F4F1EA] transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-[#FF5A5F] mt-1.5 font-medium">
                {error}
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2 flex flex-col gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              className="w-full font-semibold gap-2 h-11"
            >
              {isLoading ? (
                <span>Unlocking Lounge...</span>
              ) : (
                <>
                  <span>Join Lounge</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-[#9A978F] hover:text-white py-1.5 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Back to Lobby</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InRoomJoinCard;

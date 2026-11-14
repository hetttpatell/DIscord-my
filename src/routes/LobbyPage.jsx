import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, Radio, Plus, LogIn, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAppStore } from '../stores/useAppStore';
import { apiRequest } from '../lib/api';

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

export default function LobbyPage() {
  const navigate = useNavigate();
  const setSession = useAppStore((s) => s.setSession);

  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(
    () => (typeof window !== 'undefined' ? localStorage.getItem('afterspot_displayName') || '' : '')
  );
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const nextErrors = {};
    const trimmedRoom = roomId.trim();
    if (!trimmedRoom) {
      nextErrors.roomId = 'Room ID is required';
    } else if (!ROOM_ID_REGEX.test(trimmedRoom)) {
      nextErrors.roomId = 'Room ID must be 3-32 characters [a-zA-Z0-9_-]';
    }

    if (!password) {
      nextErrors.password = 'Password is required';
    } else if (password.length < 4 || password.length > 64) {
      nextErrors.password = 'Password must be between 4 and 64 characters';
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      nextErrors.displayName = 'Display name is required';
    } else if (trimmedName.length > 24) {
      nextErrors.displayName = 'Display name must be at most 24 characters';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || isLoading) return;

    setIsLoading(true);
    const endpoint = tab === 'create' ? '/api/rooms' : '/api/rooms/join';
    const payload = {
      roomId: roomId.trim(),
      password,
      displayName: displayName.trim(),
    };

    try {
      const data = await apiRequest(endpoint, {
        method: 'POST',
        body: payload,
      });

      setSession({
        token: data.token,
        roomId: data.roomId,
        memberId: data.memberId,
        displayName: data.displayName,
      });

      toast.success(tab === 'create' ? 'Room created!' : 'Joined room!');
      navigate(`/room/${encodeURIComponent(data.roomId)}`);
    } catch (err) {
      const msg = err.message || (tab === 'create' ? 'Failed to create room' : 'Failed to join room');
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-full flex items-center justify-center p-4 bg-[#0B0B10] text-[#F4F1EA] overflow-y-auto">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[#FF9F1C]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-[300px] h-[300px] bg-[#2EC4B6]/5 rounded-full blur-[90px] pointer-events-none" />

      <main className="relative z-10 w-full max-w-md mx-auto my-auto">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF9F1C] to-[#FF5A5F] shadow-lg shadow-[#FF9F1C]/25 mb-4">
            <Radio className="w-7 h-7 text-[#0B0B10]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F4F1EA] font-display">
            afterspot
          </h1>
          <p className="text-sm text-[#9A978F] mt-1.5">
            Listen together. In sync. On mic.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl bg-[#141419]/90 border border-white/10 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
          {/* Tab switch */}
          <div className="grid grid-cols-2 p-1 mb-6 rounded-xl bg-[#0B0B10] border border-white/5">
            <button
              type="button"
              onClick={() => {
                setTab('create');
                setErrors({});
              }}
              className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[44px] ${
                tab === 'create'
                  ? 'bg-[#1C1C24] text-[#FF9F1C] shadow-sm'
                  : 'text-[#9A978F] hover:text-[#F4F1EA]'
              }`}
              aria-label="Switch to Create Room"
            >
              <Plus className="w-4 h-4" />
              Create Room
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('join');
                setErrors({});
              }}
              className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[44px] ${
                tab === 'join'
                  ? 'bg-[#1C1C24] text-[#FF9F1C] shadow-sm'
                  : 'text-[#9A978F] hover:text-[#F4F1EA]'
              }`}
              aria-label="Switch to Join Room"
            >
              <LogIn className="w-4 h-4" />
              Join Room
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Room ID */}
            <div>
              <label
                htmlFor="roomId"
                className="block text-xs font-medium text-[#9A978F] mb-1.5"
              >
                Room ID
              </label>
              <Input
                id="roomId"
                type="text"
                placeholder="e.g. lounge-room"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  if (errors.roomId) setErrors((prev) => ({ ...prev, roomId: null }));
                }}
                disabled={isLoading}
                aria-invalid={Boolean(errors.roomId)}
                aria-describedby={errors.roomId ? 'roomId-error' : undefined}
                className={errors.roomId ? 'border-[#FF5A5F]' : ''}
              />
              <AnimatePresence>
                {errors.roomId && (
                  <motion.p
                    id="roomId-error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-[#FF5A5F] mt-1"
                  >
                    {errors.roomId}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Password with Show/Hide toggle */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-[#9A978F] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 4 characters"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
                  }}
                  disabled={isLoading}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`pr-11 ${errors.password ? 'border-[#FF5A5F]' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-[#9A978F] hover:text-[#F4F1EA] transition-colors cursor-pointer min-w-[44px]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <AnimatePresence>
                {errors.password && (
                  <motion.p
                    id="password-error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-[#FF5A5F] mt-1"
                  >
                    {errors.password}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Display Name */}
            <div>
              <label
                htmlFor="displayName"
                className="block text-xs font-medium text-[#9A978F] mb-1.5"
              >
                Display Name
              </label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your nickname"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (errors.displayName) setErrors((prev) => ({ ...prev, displayName: null }));
                }}
                disabled={isLoading}
                maxLength={24}
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={errors.displayName ? 'displayName-error' : undefined}
                className={errors.displayName ? 'border-[#FF5A5F]' : ''}
              />
              <AnimatePresence>
                {errors.displayName && (
                  <motion.p
                    id="displayName-error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-[#FF5A5F] mt-1"
                  >
                    {errors.displayName}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                className="w-full font-semibold gap-2"
                aria-label={tab === 'create' ? 'Create & Enter Room' : 'Join Room'}
              >
                {isLoading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <span>{tab === 'create' ? 'Create & Enter Room' : 'Join Room'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-[#9A978F]/60 mt-6">
          Encrypted sessions • Synced playback • Mic-only audio
        </p>
      </main>
    </div>
  );
}


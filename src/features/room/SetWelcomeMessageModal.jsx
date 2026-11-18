import React, { useState } from 'react';
import { PartyPopper, Sparkles, X, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';

export function SetWelcomeMessageModal({
  isOpen,
  onClose,
  socket,
  currentMessage = '',
}) {
  const [message, setMessage] = useState(currentMessage || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (!socket) return;

    setIsSubmitting(true);
    socket.emit(
      'room:set_welcome_message',
      { message: message.trim() },
      (res) => {
        setIsSubmitting(false);
        if (res?.ok) {
          toast.success(
            message.trim()
              ? 'Welcome announcement saved! 🎉'
              : 'Welcome announcement cleared'
          );
          onClose();
        } else {
          toast.error(res?.error || 'Failed to update announcement');
        }
      }
    );
  };

  const handleClear = () => {
    setMessage('');
    if (!socket) return;
    socket.emit('room:set_welcome_message', { message: '' }, (res) => {
      if (res?.ok) {
        toast.info('Welcome announcement cleared');
        onClose();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set Room Welcome Announcement"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl select-none animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-md w-full rounded-3xl p-6 bg-[#141419]/95 border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF9F1C] to-[#FF5A5F] flex items-center justify-center text-[#0B0B10] shadow-md shadow-[#FF9F1C]/20">
              <PartyPopper className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Party Announcement
              </h2>
              <p className="text-[11px] text-white/50">
                Shown bold & big with party poppers to every friend who joins!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="welcomeAnnouncement"
              className="flex items-center justify-between text-xs font-semibold text-white/80 mb-1.5"
            >
              <span>Welcome Message</span>
              <span className="text-[10px] text-white/40 font-mono">
                {message.length}/140 (Optional)
              </span>
            </label>
            <Input
              id="welcomeAnnouncement"
              type="text"
              maxLength={140}
              placeholder="e.g. Welcome to the watchparty! Grab your drinks 🍿"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="h-11 text-xs sm:text-sm bg-[#0B0B10] border-white/10 text-white rounded-xl placeholder:text-white/35"
              autoFocus
            />
          </div>

          <div className="p-3 rounded-xl bg-[#0B0B10]/60 border border-white/5 text-[11px] text-white/60 leading-relaxed flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#FF9F1C] shrink-0 mt-0.5" />
            <span>
              This text is optional. When set, guests see a celebratory full-screen card with raining party confetti when they enter.
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
            {currentMessage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-[#FF5A5F] hover:bg-[#FF5A5F]/15 border border-[#FF5A5F]/30 rounded-xl text-xs gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </Button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white/60 hover:text-white rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                className="rounded-xl text-xs font-bold gap-1.5 shadow-md shadow-[#FF9F1C]/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Announcement</span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SetWelcomeMessageModal;

import React from 'react';
import { UserPlus, UserMinus, Hand, MessageSquare, AlertCircle, X } from 'lucide-react';

export default function MeetingToasts({ toasts = [], onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div 
      className="fixed bottom-20 left-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => {
        let Icon = AlertCircle;
        let iconColor = 'text-[#8ab4f8]';

        if (toast.type === 'join') {
          Icon = UserPlus;
          iconColor = 'text-[#34a853]';
        } else if (toast.type === 'leave') {
          Icon = UserMinus;
          iconColor = 'text-[#f28b82]';
        } else if (toast.type === 'hand') {
          Icon = Hand;
          iconColor = 'text-[#fdd663]';
        } else if (toast.type === 'chat') {
          Icon = MessageSquare;
          iconColor = 'text-[#8ab4f8]';
        } else if (toast.type === 'device') {
          Icon = AlertCircle;
          iconColor = 'text-[#fdd663]';
        }

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#202124]/95 border border-[#3c4043] shadow-2xl backdrop-blur-md text-xs text-[#e8eaed] animate-fade-in transition-all"
            role="status"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
              <span className="truncate">{toast.message}</span>
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="text-[#9aa0a6] hover:text-white p-0.5 rounded transition-colors shrink-0"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}


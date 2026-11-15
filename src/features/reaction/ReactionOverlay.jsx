import React, { useState, useEffect } from 'react';

export function ReactionOverlay({ socket }) {
  const [reactions, setReactions] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const handleReaction = (data) => {
      // data: { id, emoji, memberId, name }
      const randomLeft = 20 + Math.random() * 60; // random percent between 20% and 80%
      const randomDrift = (Math.random() - 0.5) * 60; // -30px to +30px sideways drift
      const firstName = (data.name || 'Guest').split(' ')[0].slice(0, 10);

      const newReaction = {
        id: data.id || Math.random().toString(),
        emoji: data.emoji,
        firstName,
        left: `${randomLeft}%`,
        drift: `${randomDrift}px`,
        created: Date.now(),
      };

      setReactions((prev) => {
        // Cap at 30 concurrent reactions (drop oldest)
        const next = [...prev, newReaction];
        return next.length > 30 ? next.slice(next.length - 30) : next;
      });

      // Remove after 2600ms
      setTimeout(() => {
        setReactions((current) => current.filter((r) => r.id !== newReaction.id));
      }, 2600);
    };

    socket.on('reaction:show', handleReaction);

    return () => {
      socket.off('reaction:show', handleReaction);
    };
  }, [socket]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden z-20"
    >
      <style>{`
        @keyframes reactionFloat {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(0.6);
          }
          15% {
            opacity: 1;
            transform: translate3d(calc(var(--drift) * 0.3), -30px, 0) scale(1.15);
          }
          80% {
            opacity: 0.9;
            transform: translate3d(var(--drift), -180px, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(calc(var(--drift) * 1.2), -220px, 0) scale(0.9);
          }
        }

        @keyframes reactionFadeOnly {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1); }
          80% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.8); }
        }

        .reaction-item {
          animation: reactionFloat 2.5s cubic-bezier(0.2, 0.6, 0.35, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .reaction-item {
            animation: reactionFadeOnly 2s ease-in-out forwards;
          }
        }
      `}</style>

      {reactions.map((r) => (
        <div
          key={r.id}
          className="reaction-item absolute bottom-6 flex flex-col items-center select-none"
          style={{
            left: r.left,
            '--drift': r.drift,
          }}
        >
          <span className="text-3xl filter drop-shadow-md">{r.emoji}</span>
          <span className="text-[10px] font-bold text-white bg-black/60 backdrop-blur-md px-1.5 py-0.2 rounded-full mt-0.5 shadow-sm truncate max-w-[70px]">
            {r.firstName}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReactionBar({ socket }) {
  const emojis = ['❤️', '😂', '🔥', '👏', '😮', '🎵'];

  const sendReaction = (emoji) => {
    if (!socket) return;
    socket.emit('reaction:send', { emoji });
  };

  return (
    <div
      aria-label="Reaction Emoji Bar"
      className="flex items-center justify-center gap-1.5 p-1.5 bg-[#141419]/90 border border-white/10 rounded-2xl backdrop-blur-md shadow-lg"
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => sendReaction(emoji)}
          className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-xl rounded-xl hover:bg-white/10 active:scale-125 transition-transform cursor-pointer"
          aria-label={`Send ${emoji} reaction`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export default ReactionOverlay;


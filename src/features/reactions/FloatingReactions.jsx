import React, { useState, useEffect, useCallback } from 'react';

export function FloatingReactions({ socket, onLocalReactionRef }) {
  const [reactions, setReactions] = useState([]);

  const spawnReaction = useCallback((data) => {
    const id = data.id || `${Date.now()}-${Math.random()}`;
    // Position reactions between 55% and 92% on desktop, or 40% and 90% on mobile
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    const minLeft = isNarrow ? 40 : 60;
    const maxLeft = isNarrow ? 88 : 94;
    const leftPercent = Math.floor(Math.random() * (maxLeft - minLeft + 1)) + minLeft;
    const swayRot = (Math.random() * 16 - 8).toFixed(1); // -8deg to +8deg

    const newReaction = {
      id,
      emoji: data.emoji || '🔥',
      senderName: data.senderName || '',
      leftPercent,
      swayRot,
    };

    setReactions((prev) => [...prev.slice(-24), newReaction]); // Keep max 25 concurrent

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2650);
  }, []);

  // Expose trigger for local zero-latency emission
  useEffect(() => {
    if (onLocalReactionRef) {
      onLocalReactionRef.current = spawnReaction;
    }
  }, [onLocalReactionRef, spawnReaction]);

  useEffect(() => {
    if (!socket) return;

    const handleNewReaction = (data) => {
      if (!data || !data.emoji) return;
      spawnReaction(data);
    };

    socket.on('reaction:new', handleNewReaction);

    return () => {
      socket.off('reaction:new', handleNewReaction);
    };
  }, [socket, spawnReaction]);

  if (reactions.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-60 overflow-hidden"
    >
      {reactions.map((r) => (
        <div
          key={r.id}
          style={{
            left: `${r.leftPercent}%`,
            bottom: '84px',
            '--sway-rot': `${r.swayRot}deg`,
          }}
          className="absolute animate-float-reaction flex flex-col items-center select-none"
        >
          <span className="text-3xl sm:text-4xl filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)] transform-gpu">
            {r.emoji}
          </span>
          {r.senderName && (
            <span className="mt-0.5 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 bg-black/60 backdrop-blur-xs rounded-full border border-white/10 max-w-[80px] truncate leading-tight shadow-md">
              {r.senderName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default FloatingReactions;


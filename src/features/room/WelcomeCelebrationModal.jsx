import React, { useEffect, useRef, useCallback } from 'react';
import { PartyPopper, Sparkles, X } from 'lucide-react';

const CONFETTI_COLORS = [
  '#FF9F1C', // Amber
  '#FF5A5F', // Coral
  '#2EC4B6', // Emerald / Cyan
  '#FFE66D', // Gold Yellow
  '#A06CD5', // Purple
  '#30D158', // Apple Green
  '#0A84FF', // Sky Blue
];

export function WelcomeCelebrationModal({
  message,
  creatorDisplayName = 'Host',
  roomId,
  onClose,
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  // Mark as seen in sessionStorage
  const handleDismiss = useCallback(() => {
    if (typeof window !== 'undefined' && roomId && message) {
      try {
        sessionStorage.setItem(`welcome_seen_${roomId}_${message}`, 'true');
      } catch {}
    }
    onClose?.();
  }, [roomId, message, onClose]);

  // Keyboard Escape dismissal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDismiss]);

  // 60FPS Confetti & Party Poppers Canvas Physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Create particles shooting from bottom left, center, and right
    const particles = [];
    const PARTICLE_COUNT = 110;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const originX =
        i % 3 === 0
          ? width * 0.15
          : i % 3 === 1
          ? width * 0.85
          : width * 0.5;
      const angle =
        originX < width * 0.4
          ? (Math.PI / 180) * (280 + Math.random() * 50)
          : originX > width * 0.6
          ? (Math.PI / 180) * (210 + Math.random() * 50)
          : (Math.PI / 180) * (240 + Math.random() * 60);

      const speed = 10 + Math.random() * 14;

      particles.push({
        x: originX,
        y: height * 0.75 + Math.random() * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 7 + Math.random() * 8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12,
        wobble: Math.random() * 10,
        vWobble: 0.1 + Math.random() * 0.08,
        opacity: 1,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.28; // gravity
        p.vx *= 0.985; // friction
        p.rotation += p.vRot;
        p.wobble += p.vWobble;

        // Fade out as they fall below screen
        if (p.y > height * 0.85) {
          p.opacity -= 0.015;
        }

        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;

          if (p.shape === 'rect') {
            const w = p.size * Math.cos(p.wobble);
            ctx.fillRect(-w / 2, -p.size / 2, Math.max(2, Math.abs(w)), p.size);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2.2, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      if (alive) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome announcement"
      onClick={handleDismiss}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl select-none animate-in fade-in duration-300 cursor-pointer"
    >
      {/* 60fps Physics Party Confetti Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Celebratory Central Announcement Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-20 max-w-lg w-full rounded-[32px] p-6 sm:p-9 bg-[#141419]/95 border border-[#FF9F1C]/40 backdrop-blur-3xl shadow-[0_24px_80px_rgba(255,159,28,0.28),0_0_0_1px_rgba(255,255,255,0.12)_inset] text-center flex flex-col items-center gap-4 sm:gap-5 animate-in zoom-in-95 duration-300 cursor-default"
      >
        {/* Top Dismiss Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          aria-label="Dismiss announcement"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Party Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#FF9F1C]/25 to-[#FF5A5F]/25 border border-[#FF9F1C]/40 text-[#FF9F1C] text-xs font-black uppercase tracking-widest shadow-inner">
          <Sparkles className="w-3.5 h-3.5 fill-[#FF9F1C]" />
          <span>Room Announcement</span>
          <PartyPopper className="w-3.5 h-3.5 text-[#FF5A5F]" />
        </div>

        {/* The Big & Bold Predefined Message */}
        <div className="py-2 sm:py-3 w-full">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFE66D] via-[#FF9F1C] to-[#FF5A5F] tracking-tight text-center leading-tight sm:leading-tight drop-shadow-md break-words">
            "{message}"
          </h1>
        </div>

        {/* Host Attribution */}
        <p className="text-xs sm:text-sm text-[#9A978F] font-medium flex items-center gap-1.5">
          <span>Party hosted by</span>
          <span className="text-white font-extrabold px-2 py-0.5 rounded-md bg-white/10 border border-white/10">
            {creatorDisplayName}
          </span>
        </p>

        {/* Celebratory Enter Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-2 w-full sm:w-auto px-8 sm:px-10 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF9F1C] to-[#FF5A5F] hover:from-[#FFB03A] hover:to-[#FF6B70] active:scale-95 text-[#0B0B10] font-black text-sm sm:text-base shadow-xl shadow-[#FF9F1C]/30 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Let's Party!</span>
          <PartyPopper className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default WelcomeCelebrationModal;

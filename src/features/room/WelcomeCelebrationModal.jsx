import React, { useEffect, useRef, useCallback } from 'react';
import { PartyPopper, Sparkles, X } from 'lucide-react';

const CELEBRATION_PALETTE = [
  '#FF9F1C', // Vivid Amber
  '#FF5A5F', // Coral Rose
  '#2EC4B6', // Neon Mint
  '#FFE66D', // Radiant Gold
  '#A06CD5', // Electric Purple
  '#00F0FF', // Cyber Cyan
  '#FF2A85', // Hot Pink
  '#30D158', // Apple Green
  '#FFFFFF', // Specular White
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

  // High-Performance 60FPS Confetti & Party Poppers Engine
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

    const particles = [];
    const startTime = Date.now();
    const DURATION_MS = 5500; // 5.5 seconds active party cannon simulation

    // Helper to spawn a burst of particles from an origin
    const spawnBurst = (x, y, count, baseAngle, spreadAngle, powerMin, powerMax) => {
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * spreadAngle;
        const speed = powerMin + Math.random() * (powerMax - powerMin);
        const shapeType = Math.random();
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 6 + Math.random() * 8,
          color: CELEBRATION_PALETTE[Math.floor(Math.random() * CELEBRATION_PALETTE.length)],
          rotation: Math.random() * 360,
          vRot: (Math.random() - 0.5) * 16,
          wobble: Math.random() * 10,
          vWobble: 0.08 + Math.random() * 0.1,
          opacity: 1,
          shape: shapeType < 0.5 ? 'rect' : shapeType < 0.8 ? 'circle' : 'star',
          decay: 0.003 + Math.random() * 0.005,
        });
      }
    };

    // Initial dual cannon explosion from bottom corners
    spawnBurst(width * 0.1, height * 0.88, 70, -Math.PI / 3, Math.PI / 4, 14, 26);
    spawnBurst(width * 0.9, height * 0.88, 70, -Math.PI * 2 / 3, Math.PI / 4, 14, 26);
    spawnBurst(width * 0.5, height * 0.7, 50, -Math.PI / 2, Math.PI / 3, 10, 20);

    // Secondary delayed burst at 700ms
    const secondaryTimer = setTimeout(() => {
      if (Date.now() - startTime < DURATION_MS) {
        spawnBurst(width * 0.2, height * 0.85, 40, -Math.PI / 3.2, Math.PI / 5, 12, 22);
        spawnBurst(width * 0.8, height * 0.85, 40, -Math.PI * 2 / 3.2, Math.PI / 5, 12, 22);
      }
    }, 700);

    // Draw 5-pointed star
    const drawStar = (cx, cy, spikes, outerRadius, innerRadius, color) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;

      ctx.beginPath();
      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      let alive = false;
      const now = Date.now();
      const elapsed = now - startTime;

      // Ongoing soft glitter sprinkle while celebration is active
      if (elapsed < DURATION_MS && Math.random() < 0.35) {
        particles.push({
          x: Math.random() * width,
          y: -10,
          vx: (Math.random() - 0.5) * 2,
          vy: 2 + Math.random() * 3.5,
          size: 4 + Math.random() * 5,
          color: CELEBRATION_PALETTE[Math.floor(Math.random() * CELEBRATION_PALETTE.length)],
          rotation: Math.random() * 360,
          vRot: (Math.random() - 0.5) * 8,
          wobble: Math.random() * 6,
          vWobble: 0.05 + Math.random() * 0.05,
          opacity: 1,
          shape: Math.random() < 0.6 ? 'circle' : 'rect',
          decay: 0.005,
        });
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22; // subtle realistic gravity
        p.vx *= 0.985; // air drag
        p.rotation += p.vRot;
        p.wobble += p.vWobble;

        if (p.y > height * 0.8) {
          p.opacity -= 0.02;
        } else {
          p.opacity -= p.decay;
        }

        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));

          if (p.shape === 'rect') {
            const w = p.size * Math.cos(p.wobble);
            ctx.fillStyle = p.color;
            ctx.fillRect(-w / 2, -p.size / 2, Math.max(2, Math.abs(w)), p.size);
          } else if (p.shape === 'star') {
            drawStar(0, 0, 5, p.size * 0.8, p.size * 0.4, p.color);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
          }

          ctx.restore();
        }
      }

      if (alive || elapsed < DURATION_MS) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(secondaryTimer);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Room welcome announcement"
      onClick={handleDismiss}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl select-none animate-in fade-in duration-300 cursor-pointer overflow-hidden"
    >
      {/* 60fps Party Confetti Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Floating 3D Ambient Celebration Elements behind the card */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-gradient-to-tr from-[#FF9F1C]/25 via-[#FF5A5F]/25 to-[#2EC4B6]/20 rounded-full blur-[110px] pointer-events-none animate-pulse" />

      {/* Floating 3D Celebration Emojis floating around the card */}
      <div className="hidden sm:block absolute -top-8 left-1/4 text-4xl animate-bounce pointer-events-none z-20 select-none">
        🎉
      </div>
      <div className="hidden sm:block absolute top-12 right-1/4 text-4xl animate-pulse pointer-events-none z-20 select-none">
        ✨
      </div>
      <div className="hidden sm:block absolute bottom-16 left-1/3 text-3xl animate-bounce pointer-events-none z-20 select-none">
        🍿
      </div>
      <div className="hidden sm:block absolute bottom-20 right-1/3 text-4xl animate-pulse pointer-events-none z-20 select-none">
        🥳
      </div>

      {/* Celebratory Hero Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-20 max-w-xl w-full rounded-[36px] p-6 sm:p-10 bg-[#141419]/90 border border-white/20 backdrop-blur-3xl shadow-[0_32px_100px_rgba(255,159,28,0.35),0_0_0_1px_rgba(255,255,255,0.15)_inset] text-center flex flex-col items-center gap-5 sm:gap-6 animate-in zoom-in-95 duration-300 cursor-default"
      >
        {/* Top Dismiss Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
          aria-label="Dismiss announcement"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Celebration Pill Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#FF9F1C]/20 via-[#FF5A5F]/20 to-[#2EC4B6]/20 border border-[#FF9F1C]/40 text-[#FFE66D] text-xs font-black uppercase tracking-widest shadow-inner shadow-[#FF9F1C]/20">
          <PartyPopper className="w-4 h-4 text-[#FF9F1C] animate-spin" style={{ animationDuration: '4s' }} />
          <span>Lounge Announcement</span>
          <Sparkles className="w-4 h-4 text-[#2EC4B6]" />
        </div>

        {/* Big & Bold Predefined Message Display */}
        <div className="py-2 sm:py-4 w-full">
          <p className="text-3xl sm:text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFF07C] via-[#FF9F1C] to-[#FF5A5F] tracking-tight text-center leading-snug sm:leading-tight drop-shadow-[0_4px_24px_rgba(255,159,28,0.45)] break-words font-display">
            "{message}"
          </p>
        </div>

        {/* Host Attribution & Lounge Details */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm text-[#9A978F] font-medium">
          <span>Party hosted by</span>
          <span className="inline-flex items-center gap-1.5 text-white font-extrabold px-3 py-1 rounded-full bg-white/10 border border-white/15 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#30D158]" />
            {creatorDisplayName}
          </span>
        </div>

        {/* Action Button: "Let's Party! 🎉" */}
        <div className="w-full pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full sm:w-auto px-10 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF9F1C] via-[#FF7A45] to-[#FF5A5F] hover:opacity-95 active:scale-95 text-[#0B0B10] font-black text-sm sm:text-base shadow-[0_12px_36px_rgba(255,159,28,0.4)] transition-all cursor-pointer flex items-center justify-center gap-2.5"
          >
            <PartyPopper className="w-5 h-5" />
            <span>Let's Party!</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeCelebrationModal;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  Eraser,
  Trash2,
  Send,
  Trophy,
  Play,
  RotateCcw,
  Sparkles,
  FastForward,
  X,
  Minimize2,
  Clock,
  Gamepad2,
  CheckCircle2,
  Flame,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../../stores/useAppStore';

const COLOR_PALETTE = [
  '#FFFFFF',
  '#000000',
  '#FF5A5F',
  '#FF9F1C',
  '#FFE66D',
  '#2EC4B6',
  '#4D96FF',
  '#9B5DE5',
  '#F15BB5',
  '#8AC926',
  '#A0522D',
  '#708090',
];

const BRUSH_SIZES = [
  { label: 'S', size: 3, dotSize: 4 },
  { label: 'M', size: 8, dotSize: 7 },
  { label: 'L', size: 16, dotSize: 11 },
];

export function ScribbleArena({ open, onClose, socket }) {
  const memberId = useAppStore((s) => s.memberId);
  const displayName = useAppStore((s) => s.displayName);

  const canvasRef = useRef(null);
  const isPointerDownRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });

  // Game state from server
  const [gameState, setGameState] = useState({
    status: 'idle',
    currentDrawerId: null,
    currentDrawerName: null,
    word: '',
    maskedWord: '',
    wordLength: 0,
    category: '',
    round: 0,
    maxRounds: 5,
    timeRemaining: 60,
    scores: {},
    guessedMemberIds: [],
    drawHistory: [],
    isDrawer: false,
  });

  // Local drawing tools
  const [selectedColor, setSelectedColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(8);
  const [isEraser, setIsEraser] = useState(false);

  // Chat & Guesses
  const [guessInput, setGuessInput] = useState('');
  const [chatLog, setChatLog] = useState([]);

  // Floating live guess HUD with 3.2-second auto-slide
  const [isFloatingFeedOpen, setIsFloatingFeedOpen] = useState(true);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isFullChatOpen, setIsFullChatOpen] = useState(false);
  const autoHideTimeoutRef = useRef(null);

  const isDrawer = gameState.currentDrawerId === memberId;
  const isRoundActive = gameState.status === 'drawing';
  const hasGuessed =
    Array.isArray(gameState.guessedMemberIds) &&
    gameState.guessedMemberIds.includes(memberId);

  // Reset 3.2-second auto-slide timer
  const resetAutoHideTimer = useCallback(() => {
    setIsFloatingFeedOpen(true);
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current);
    }
    autoHideTimeoutRef.current = setTimeout(() => {
      setIsFloatingFeedOpen(false);
    }, 3200);
  }, []);

  // Clean up auto-hide timer on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current);
      }
    };
  }, []);

  // Helper to draw a line segment on canvas
  const drawSegment = useCallback((x0, y0, x1, y1, color, size) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.strokeStyle = color;
    ctx.lineWidth = size * (w / 700);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.stroke();
  }, []);

  // Redraw canvas with full history
  const redrawCanvas = useCallback(
    (history) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#141419';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (Array.isArray(history)) {
        history.forEach((stroke) => {
          drawSegment(
            stroke.x0,
            stroke.y0,
            stroke.x1,
            stroke.y1,
            stroke.color,
            stroke.size
          );
        });
      }
    },
    [drawSegment]
  );

  // Auto-resize canvas to match container size
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const w = Math.floor(width);
          const h = Math.floor(height);
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            redrawCanvas(gameState.drawHistory || []);
          }
        }
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => resizeObserver.disconnect();
  }, [open, gameState.drawHistory, redrawCanvas]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleState = (state) => {
      if (!state) return;
      setGameState(state);
      redrawCanvas(state.drawHistory || []);
    };

    const handleTick = ({ timeRemaining }) => {
      setGameState((prev) => ({ ...prev, timeRemaining }));
    };

    const handleDraw = (stroke) => {
      drawSegment(
        stroke.x0,
        stroke.y0,
        stroke.x1,
        stroke.y1,
        stroke.color,
        stroke.size
      );
      setGameState((prev) => ({
        ...prev,
        drawHistory: [...(prev.drawHistory || []), stroke],
      }));
    };

    const handleClear = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#141419';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      setGameState((prev) => ({ ...prev, drawHistory: [] }));
    };

    const handleCorrectGuess = (data) => {
      setChatLog((prev) => [
        ...prev,
        {
          id: `cg-${Date.now()}-${Math.random()}`,
          isCorrect: true,
          displayName: data.displayName,
          points: data.points,
          text: `🎉 ${data.displayName} guessed the word! (+${data.points} pts)`,
        },
      ]);
      setGameState((prev) => ({
        ...prev,
        scores: data.scores || prev.scores,
        guessedMemberIds: [...(prev.guessedMemberIds || []), data.memberId],
      }));
      resetAutoHideTimer();
      toast.success(`${data.displayName} guessed the word! 🎉 (+${data.points} pts)`);
    };

    const handleChat = (msg) => {
      setChatLog((prev) => [...prev, msg]);
      resetAutoHideTimer();
    };

    const handleRoundStart = (data) => {
      handleClear();
      setChatLog((prev) => [
        ...prev,
        {
          id: `rs-${Date.now()}`,
          isSystem: true,
          text: `🔔 Round ${data.round} started! ${data.drawerName} is drawing (${data.category})`,
        },
      ]);
      resetAutoHideTimer();
    };

    const handleRoundEnd = (data) => {
      setChatLog((prev) => [
        ...prev,
        {
          id: `re-${Date.now()}`,
          isSystem: true,
          text: `🏁 Round finished! The secret word was "${data.word}" (${data.reason})`,
        },
      ]);
      toast.info(`Round finished! Word was: ${data.word}`);
    };

    const handleMatchEnd = (data) => {
      toast.success('🏆 Match finished! Final scores on leaderboard.');
      setGameState((prev) => ({
        ...prev,
        status: 'idle',
        scores: data.scores || prev.scores,
      }));
    };

    socket.on('game:state', handleState);
    socket.on('game:tick', handleTick);
    socket.on('game:draw', handleDraw);
    socket.on('game:clear', handleClear);
    socket.on('game:correct_guess', handleCorrectGuess);
    socket.on('game:chat', handleChat);
    socket.on('game:round_start', handleRoundStart);
    socket.on('game:round_end', handleRoundEnd);
    socket.on('game:match_end', handleMatchEnd);

    return () => {
      socket.off('game:state', handleState);
      socket.off('game:tick', handleTick);
      socket.off('game:draw', handleDraw);
      socket.off('game:clear', handleClear);
      socket.off('game:correct_guess', handleCorrectGuess);
      socket.off('game:chat', handleChat);
      socket.off('game:round_start', handleRoundStart);
      socket.off('game:round_end', handleRoundEnd);
      socket.off('game:match_end', handleMatchEnd);
    };
  }, [socket, drawSegment, redrawCanvas, resetAutoHideTimer]);

  // Pointer event handlers for drawing
  const handlePointerDown = (e) => {
    if (!isDrawer || !isRoundActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    lastPointRef.current = { x, y };
  };

  const handlePointerMove = (e) => {
    if (!isPointerDownRef.current || !isDrawer || !isRoundActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const color = isEraser ? '#141419' : selectedColor;
    const size = isEraser ? brushSize * 2.2 : brushSize;

    drawSegment(lastPointRef.current.x, lastPointRef.current.y, x, y, color, size);

    socket?.emit('game:draw', {
      x0: lastPointRef.current.x,
      y0: lastPointRef.current.y,
      x1: x,
      y1: y,
      color,
      size,
    });

    lastPointRef.current = { x, y };
  };

  const handlePointerUp = (e) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    try {
      e.target?.releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handleClearCanvas = () => {
    if (!isDrawer || !isRoundActive) return;
    socket?.emit('game:clear');
  };

  const handleSkipRound = () => {
    if (!isDrawer || !isRoundActive) return;
    socket?.emit('game:skip');
  };

  const handleStartGame = () => {
    socket?.emit('game:start');
  };

  const handleResetGame = () => {
    socket?.emit('game:reset');
  };

  const handleSendGuess = (e) => {
    e.preventDefault();
    if (!guessInput.trim() || isDrawer || !isRoundActive) return;

    socket?.emit('game:guess', { text: guessInput.trim() });
    setGuessInput('');
    resetAutoHideTimer();
  };

  // Sorted leaderboard
  const scoreboard = Object.entries(gameState.scores || {})
    .map(([id, info]) => ({ id, name: info.name, score: info.score }))
    .sort((a, b) => b.score - a.score);

  const topPlayer = scoreboard[0];

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scribble & Guess Arena"
      className="fixed inset-0 h-[100dvh] w-screen z-[60] flex flex-col bg-[#0B0B10] text-[#F4F1EA] select-none animate-in fade-in duration-200 overflow-hidden"
    >
      {/* ============================================================== */}
      {/* 1. TIER 1: TOP STATUS & CONTROLS BAR (CLEAN & SPACIOUS) */}
      {/* ============================================================== */}
      <header className="h-12 px-3 sm:px-6 flex items-center justify-between border-b border-white/10 bg-[#121217]/95 shrink-0 z-20">
        {/* Left: Game Title, Round & Category */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-[#FF5A5F] to-[#FF9F1C] text-white shadow-md shadow-[#FF5A5F]/20 shrink-0">
            <Gamepad2 className="w-4 h-4 stroke-[2.2]" />
          </div>
          <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white whitespace-nowrap">
            Scribble
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold font-mono bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]/30 shrink-0">
            R{gameState.round || 1}/{gameState.maxRounds || 5}
          </span>
          <span className="text-[10px] text-[#2EC4B6] font-semibold truncate hidden xs:inline max-w-[110px] sm:max-w-none">
            {gameState.category || 'Surprise'}
          </span>
        </div>

        {/* Right: Timer, Trophy Leaderboard Button, Minimize & Close */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Round Timer Badge */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-mono font-extrabold text-[11px] sm:text-xs transition-all ${
              gameState.timeRemaining <= 10
                ? 'bg-[#FF5A5F]/20 text-[#FF5A5F] border-[#FF5A5F]/40 shadow-md shadow-[#FF5A5F]/20 animate-pulse'
                : 'bg-[#1C1C24] text-[#F4F1EA] border-white/10'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>{gameState.timeRemaining}s</span>
          </div>

          {/* Leaderboard Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsLeaderboardOpen((prev) => !prev)}
            aria-label="Toggle leaderboard"
            className={`h-7 sm:h-8 px-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              isLeaderboardOpen
                ? 'bg-[#FFE66D]/20 text-[#FFE66D] border border-[#FFE66D]/40'
                : 'text-[#9A978F] hover:text-white hover:bg-white/10'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-[#FFE66D]" />
            <span className="hidden sm:inline">
              {topPlayer ? `${topPlayer.name.split(' ')[0]} (${topPlayer.score})` : 'Scores'}
            </span>
          </Button>

          {/* Minimize / Close */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Minimize arena"
            className="w-7 h-7 sm:w-8 sm:h-8 p-0 rounded-lg text-[#9A978F] hover:text-white hover:bg-white/10"
            title="Minimize Arena"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close arena"
            className="w-7 h-7 sm:w-8 sm:h-8 p-0 rounded-lg text-[#9A978F] hover:text-[#FF5A5F] hover:bg-white/10"
            title="Close Arena"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. TIER 2: DEDICATED CLUE & WORD BANNER (FULL WIDTH, NO SQUISHING) */}
      {/* ============================================================== */}
      <div className="h-11 px-3 sm:px-6 flex items-center justify-center border-b border-white/5 bg-[#141419]/90 shrink-0 z-10 shadow-inner">
        {isDrawer ? (
          /* Drawer View: Big Bold Word */
          <div className="flex items-center gap-2 text-center animate-in fade-in duration-200">
            <span className="text-[10px] sm:text-xs text-[#FF9F1C] font-extrabold uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#FF9F1C]" />
              DRAW THIS:
            </span>
            <span className="text-sm sm:text-base font-black text-white tracking-[0.25em] font-mono uppercase bg-[#FF9F1C]/15 border border-[#FF9F1C]/30 px-3 py-0.5 rounded-lg">
              {gameState.word || 'Loading...'}
            </span>
          </div>
        ) : (
          /* Guesser View: Spaced Mystery Letters */
          <div className="flex items-center gap-2 sm:gap-3 text-center animate-in fade-in duration-200">
            {hasGuessed ? (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-[#2EC4B6] bg-[#2EC4B6]/15 border border-[#2EC4B6]/30 px-3 py-0.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>YOU GUESSED IT: {gameState.word}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#9A978F] hidden sm:inline">
                  {gameState.currentDrawerName ? `${gameState.currentDrawerName} is drawing:` : 'Clue:'}
                </span>
                <span className="text-base sm:text-lg font-black tracking-[0.35em] font-mono text-white select-all">
                  {gameState.maskedWord || '_ _ _ _ _'}
                </span>
                {gameState.wordLength > 0 && (
                  <span className="text-[10px] font-mono font-semibold text-[#9A978F] bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                    {gameState.wordLength} letters
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. MAIN UNIFIED SCREEN: HERO CANVAS + NON-BLOCKING LIVE HUD */}
      {/* ============================================================== */}
      <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row p-2 sm:p-4 gap-3 overflow-hidden">
        {/* Drawing Pad Stage */}
        <section
          aria-label="Primary Drawing Pad"
          className="relative flex-1 min-h-0 flex flex-col gap-2 rounded-2xl overflow-hidden"
        >
          {/* Canvas Wrapper */}
          <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-white/10 bg-[#141419] shadow-2xl flex items-center justify-center">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-full h-full block touch-none select-none ${
                isDrawer && isRoundActive ? 'cursor-crosshair' : 'cursor-default'
              }`}
              style={{ touchAction: 'none' }}
            />

            {/* FLOATING LIVE GUESS HUD (BOTTOM-LEFT, NON-BLOCKING, ZERO CUT-OFF) */}
            <div className="absolute bottom-3 left-3 z-30 pointer-events-none flex flex-col items-start gap-1.5 max-w-[85%] sm:max-w-xs">
              {isFloatingFeedOpen ? (
                /* Expanded Floating Badges */
                <div className="pointer-events-auto flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-xl bg-[#141419]/90 border border-white/10 backdrop-blur-md shadow-lg">
                    <span className="text-[10px] font-bold text-[#FF9F1C] flex items-center gap-1">
                      <Flame className="w-3 h-3 text-[#FF5A5F]" /> Live Guesses
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFloatingFeedOpen(false)}
                      className="text-[#9A978F] hover:text-white p-0.5 cursor-pointer"
                      title="Hide Live Guesses"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {chatLog.slice(-4).map((msg) => (
                      <div
                        key={msg.id}
                        className={`px-2.5 py-1 rounded-xl text-[11px] leading-tight backdrop-blur-md shadow-md ${
                          msg.isCorrect
                            ? 'bg-[#2EC4B6]/25 border border-[#2EC4B6]/40 text-[#2EC4B6] font-black'
                            : msg.isSystem
                            ? 'bg-[#1C1C24]/85 text-[#FF9F1C] border border-white/10 italic font-semibold'
                            : 'bg-[#1C1C24]/85 text-[#F4F1EA] border border-white/10'
                        }`}
                      >
                        {!msg.isSystem && !msg.isCorrect && (
                          <span className="font-bold text-[#9A978F] mr-1">
                            {msg.displayName}:
                          </span>
                        )}
                        <span>{msg.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Collapsed Discrete Floating Pill (Never cut off, 100% inside canvas!) */
                <button
                  type="button"
                  onClick={() => resetAutoHideTimer()}
                  className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1C1C24]/90 border border-white/15 text-white backdrop-blur-md shadow-xl hover:bg-[#252530] cursor-pointer transition-transform hover:scale-105 active:scale-95"
                >
                  <MessageSquare className="w-3 h-3 text-[#FF9F1C]" />
                  <span className="text-[10px] font-bold">
                    {chatLog.length > 0 ? `${chatLog.length} Guesses` : 'Guesses'}
                  </span>
                </button>
              )}
            </div>

            {/* Idle Overlay: Start Game */}
            {gameState.status === 'idle' && (
              <div className="absolute inset-0 bg-[#0B0B10]/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 text-center animate-in fade-in duration-300 z-10">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-3xl bg-gradient-to-tr from-[#FF9F1C] to-[#FFE66D] flex items-center justify-center text-[#0B0B10] shadow-2xl shadow-[#FF9F1C]/30 animate-bounce">
                  <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Scribble Arena
                  </h2>
                  <p className="text-xs text-[#9A978F] leading-relaxed">
                    105+ words with zero repetition! One draws, everyone guesses in real time.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="default"
                  onClick={handleStartGame}
                  className="gap-2 px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-2xl shadow-[#FF9F1C]/30 hover:scale-105 transition-transform"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Match (5 Rounds)
                </Button>
              </div>
            )}

            {/* Round End Overlay */}
            {gameState.status === 'round_end' && (
              <div className="absolute inset-0 bg-[#0B0B10]/90 backdrop-blur-md flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 text-center animate-in zoom-in-95 duration-200 z-10">
                <span className="text-xs font-bold text-[#2EC4B6] uppercase tracking-widest bg-[#2EC4B6]/15 px-3 py-1 rounded-full border border-[#2EC4B6]/30">
                  Round Ended
                </span>
                <span className="text-xs text-[#9A978F]">The secret word was:</span>
                <h3 className="text-2xl sm:text-4xl font-black text-[#FF9F1C] font-mono tracking-widest drop-shadow-lg">
                  {gameState.word}
                </h3>
                <span className="text-xs text-[#9A978F] flex items-center gap-1.5 mt-2">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  Next round starting in a few seconds...
                </span>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* 4. BOTTOM CONTROLS (STUDIO TOOLBAR FOR DRAWER / GUESS BAR FOR GUESSER) */}
          {/* ============================================================== */}
          {isDrawer && isRoundActive ? (
            /* Drawer Studio Palette & Tools */
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 sm:p-2.5 bg-[#1C1C24] rounded-2xl border border-white/10 shadow-xl shrink-0">
              {/* 12 Designer Colors Palette */}
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-0.5 max-w-full">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setSelectedColor(color);
                      setIsEraser(false);
                    }}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 transition-all cursor-pointer shrink-0 ${
                      selectedColor === color && !isEraser
                        ? 'scale-125 border-white ring-4 ring-[#FF9F1C]/40 shadow-lg'
                        : 'border-white/20 hover:scale-110'
                    }`}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>

              {/* Tools & Stroke Widths */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {BRUSH_SIZES.map((b) => (
                  <button
                    key={b.size}
                    type="button"
                    onClick={() => setBrushSize(b.size)}
                    className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border font-bold text-[11px] sm:text-xs cursor-pointer transition-all ${
                      brushSize === b.size && !isEraser
                        ? 'bg-[#FF9F1C] text-[#0B0B10] border-[#FF9F1C] shadow-md shadow-[#FF9F1C]/20'
                        : 'bg-white/5 border-white/10 text-[#9A978F] hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="rounded-full bg-current"
                      style={{ width: b.dotSize, height: b.dotSize }}
                    />
                    <span>{b.label}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setIsEraser((prev) => !prev)}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                    isEraser
                      ? 'bg-[#FF9F1C] text-[#0B0B10] border-[#FF9F1C]'
                      : 'bg-white/5 border-white/10 text-[#9A978F] hover:bg-white/10'
                  }`}
                  title="Eraser"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Eraser</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/10 bg-white/5 text-[#FF5A5F] hover:bg-[#FF5A5F]/15 font-bold text-[11px] sm:text-xs cursor-pointer transition-all"
                  title="Clear Canvas"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>

                <button
                  type="button"
                  onClick={handleSkipRound}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/10 bg-white/5 text-[#FFE66D] hover:bg-[#FFE66D]/15 font-bold text-[11px] sm:text-xs cursor-pointer transition-all"
                  title="Skip Round"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Skip</span>
                </button>
              </div>
            </div>
          ) : (
            /* Guesser Bottom Input Bar (Always Accessible in Mobile & Desktop) */
            <form
              onSubmit={handleSendGuess}
              className="flex gap-2 p-1.5 sm:p-2 bg-[#1C1C24] rounded-2xl border border-white/10 shadow-xl shrink-0 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
            >
              <Input
                type="text"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck="false"
                placeholder={
                  hasGuessed
                    ? '🎉 You guessed it! Waiting for others...'
                    : !isRoundActive
                    ? 'Round starting shortly...'
                    : 'Type your guess here (e.g. Pizza)...'
                }
                value={guessInput}
                onChange={(e) => {
                  setGuessInput(e.target.value);
                  resetAutoHideTimer();
                }}
                onFocus={resetAutoHideTimer}
                disabled={!isRoundActive || hasGuessed}
                className="flex-1 h-10 sm:h-11 text-xs sm:text-sm bg-[#141419] border-white/10 text-white placeholder:text-[#9A978F] rounded-xl"
              />
              <Button
                type="submit"
                variant="primary"
                size="default"
                disabled={!isRoundActive || hasGuessed || !guessInput.trim()}
                className="h-10 sm:h-11 px-4 sm:px-5 shrink-0 rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-[#FF9F1C]/20"
              >
                <span>Guess</span>
                <Send className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="default"
                onClick={() => setIsFullChatOpen((prev) => !prev)}
                className="h-10 sm:h-11 px-3 shrink-0 rounded-xl text-[#9A978F] hover:text-white border border-white/10"
                title="Full Guess Log"
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
            </form>
          )}
        </section>

        {/* Desktop Sidebar OR Slide-over Leaderboard / Full Chat */}
        {(isLeaderboardOpen || isFullChatOpen || window.innerWidth >= 1024) && (
          <aside
            aria-label="Room Leaderboard and Guesses"
            className={`${
              window.innerWidth >= 1024
                ? 'w-72 shrink-0 flex flex-col gap-3 min-h-0'
                : 'fixed inset-y-12 sm:inset-y-16 right-0 z-40 w-80 max-w-[85vw] bg-[#141419]/95 border-l border-white/15 backdrop-blur-2xl p-4 shadow-2xl flex flex-col gap-3 animate-in slide-in-from-right duration-200'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Trophy className="w-4 h-4 text-[#FFE66D]" />
                <span>Room Leaderboard</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLeaderboardOpen(false);
                  setIsFullChatOpen(false);
                }}
                className="p-1 rounded-md text-[#9A978F] hover:text-white cursor-pointer lg:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Players List */}
            <div className="h-44 sm:h-52 overflow-y-auto flex flex-col gap-1.5 pr-1 text-xs shrink-0">
              {scoreboard.length === 0 ? (
                <span className="text-xs text-[#9A978F] m-auto italic">
                  Scores will appear here
                </span>
              ) : (
                scoreboard.map((p, idx) => {
                  const isPlayerDrawer = gameState.currentDrawerId === p.id;
                  const hasPlayerGuessed =
                    Array.isArray(gameState.guessedMemberIds) &&
                    gameState.guessedMemberIds.includes(p.id);

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                        p.id === memberId
                          ? 'bg-[#FF9F1C]/15 border-[#FF9F1C]/40 text-white'
                          : 'bg-[#1C1C24] border-white/5 text-[#9A978F]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px] font-mono shrink-0">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold truncate text-[#F4F1EA]">
                            {p.name} {p.id === memberId && '(You)'}
                          </span>
                          <span className="text-[9px]">
                            {isPlayerDrawer ? (
                              <span className="text-[#FF9F1C] font-bold">✏️ Drawing</span>
                            ) : hasPlayerGuessed ? (
                              <span className="text-[#2EC4B6] font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Guessed
                              </span>
                            ) : (
                              <span className="text-[#9A978F]">Thinking...</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-[#FF9F1C] shrink-0">
                        {p.score} pts
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Full Chat Log (Scrollable) */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-2 border-t border-white/10">
              <span className="text-[11px] font-bold text-white mb-1.5 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#FF5A5F]" /> Full Guesses Stream
              </span>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 text-xs">
                {chatLog.length === 0 ? (
                  <span className="text-[10px] text-[#9A978F] m-auto italic">
                    No guesses yet
                  </span>
                ) : (
                  chatLog.map((msg) => (
                    <div
                      key={msg.id}
                      className={`leading-snug p-1.5 rounded-lg text-xs ${
                        msg.isCorrect
                          ? 'bg-[#2EC4B6]/15 border border-[#2EC4B6]/30 text-[#2EC4B6] font-bold shadow-sm'
                          : msg.isSystem
                          ? 'bg-white/5 text-[#FF9F1C] italic'
                          : 'bg-[#1C1C24] text-[#F4F1EA]'
                      }`}
                    >
                      {!msg.isSystem && !msg.isCorrect && (
                        <span className="font-bold text-[#9A978F] mr-1.5">
                          {msg.displayName}:
                        </span>
                      )}
                      <span>{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Match Reset Action */}
            <div className="flex items-center justify-between text-[11px] text-[#9A978F] pt-2 border-t border-white/10 shrink-0">
              <span>{displayName || 'Guest'}</span>
              <button
                type="button"
                onClick={handleResetGame}
                className="flex items-center gap-1 hover:text-[#FF5A5F] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Match
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default ScribbleArena;

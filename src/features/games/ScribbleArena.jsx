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
];

const BRUSH_SIZES = [
  { label: 'S', size: 3, dotSize: 4 },
  { label: 'M', size: 7, dotSize: 7 },
  { label: 'L', size: 14, dotSize: 11 },
];

export function ScribbleArena({ open, onClose, socket }) {
  const memberId = useAppStore((s) => s.memberId);
  const displayName = useAppStore((s) => s.displayName);

  const canvasRef = useRef(null);
  const chatBottomRef = useRef(null);
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
  const [brushSize, setBrushSize] = useState(7);
  const [isEraser, setIsEraser] = useState(false);

  // Chat & Guesses
  const [guessInput, setGuessInput] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [mobileTab, setMobileTab] = useState('board'); // 'board' | 'hub'

  const isDrawer = gameState.currentDrawerId === memberId;
  const isRoundActive = gameState.status === 'drawing';
  const hasGuessed =
    Array.isArray(gameState.guessedMemberIds) &&
    gameState.guessedMemberIds.includes(memberId);

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
      toast.success(`${data.displayName} guessed the word! 🎉 (+${data.points} pts)`);
    };

    const handleChat = (msg) => {
      setChatLog((prev) => [...prev, msg]);
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
  }, [socket, drawSegment, redrawCanvas]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

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
  };

  // Sorted leaderboard
  const scoreboard = Object.entries(gameState.scores || {})
    .map(([id, info]) => ({ id, name: info.name, score: info.score }))
    .sort((a, b) => b.score - a.score);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scribble & Guess Arena"
      className="fixed inset-0 z-50 flex flex-col bg-[#0B0B10]/95 backdrop-blur-2xl text-[#F4F1EA] select-none animate-in fade-in duration-200"
    >
      {/* Top Header Bar */}
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-white/10 bg-[#141419]/90 shrink-0">
        {/* Left: Branding & Round */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF5A5F] to-[#FF9F1C] text-white shadow-lg shadow-[#FF5A5F]/20">
            <Gamepad2 className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight font-sans text-white">
                Scribble & Guess
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]/30">
                Round {gameState.round || 1}/{gameState.maxRounds || 5}
              </span>
            </div>
            <span className="text-[11px] text-[#9A978F]">
              Category: <strong className="text-[#2EC4B6]">{gameState.category || 'Surprise'}</strong>
            </span>
          </div>
        </div>

        {/* Center: Secret Word Clue Banner */}
        <div className="hidden md:flex flex-col items-center">
          {isDrawer ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#FF9F1C]/15 border border-[#FF9F1C]/40 shadow-inner">
              <span className="text-xs text-[#FF9F1C] font-semibold uppercase tracking-wider">
                🎨 Your Turn to Draw:
              </span>
              <span className="text-base font-extrabold text-white tracking-widest font-mono">
                {gameState.word || 'Loading...'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-5 py-1.5 rounded-xl bg-[#1C1C24] border border-white/10">
              <span className="text-xs text-[#9A978F]">
                {gameState.currentDrawerName
                  ? `${gameState.currentDrawerName} is drawing:`
                  : 'Waiting to start...'}
              </span>
              <span className="text-lg font-black tracking-widest font-mono text-[#F4F1EA]">
                {hasGuessed ? (
                  <span className="text-[#2EC4B6]">🎉 {gameState.word}</span>
                ) : (
                  gameState.maskedWord || '_ _ _ _ _'
                )}
              </span>
              {!hasGuessed && gameState.wordLength > 0 && (
                <span className="text-[11px] font-mono text-[#9A978F]">
                  ({gameState.wordLength} letters)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Round Timer & Window Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Timer Badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono font-extrabold text-xs sm:text-sm transition-all ${
              gameState.timeRemaining <= 10
                ? 'bg-[#FF5A5F]/20 text-[#FF5A5F] border-[#FF5A5F]/40 shadow-lg shadow-[#FF5A5F]/20 animate-pulse'
                : 'bg-[#1C1C24] text-[#F4F1EA] border-white/10'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{gameState.timeRemaining}s</span>
          </div>

          {/* Minimize / Close */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Minimize arena"
            className="w-9 h-9 p-0 rounded-xl text-[#9A978F] hover:text-white hover:bg-white/10"
            title="Minimize Arena"
          >
            <Minimize2 className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close arena"
            className="w-9 h-9 p-0 rounded-xl text-[#9A978F] hover:text-[#FF5A5F] hover:bg-white/10"
            title="Close Arena"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Mobile Word Banner & Tabs */}
      <div className="md:hidden flex flex-col gap-2 p-2 bg-[#1C1C24] border-b border-white/10 text-xs">
        <div className="flex items-center justify-between">
          {isDrawer ? (
            <span className="text-xs font-bold text-[#FF9F1C] font-mono">
              DRAW: {gameState.word}
            </span>
          ) : (
            <span className="text-xs font-bold tracking-widest font-mono text-[#F4F1EA]">
              {hasGuessed ? `🎉 ${gameState.word}` : gameState.maskedWord || '_ _ _ _ _'}
            </span>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMobileTab('board')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                mobileTab === 'board'
                  ? 'bg-[#FF9F1C] text-[#0B0B10]'
                  : 'bg-white/5 text-[#9A978F]'
              }`}
            >
              Canvas
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('hub')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                mobileTab === 'hub'
                  ? 'bg-[#FF9F1C] text-[#0B0B10]'
                  : 'bg-white/5 text-[#9A978F]'
              }`}
            >
              Chat & Ranks
            </button>
          </div>
        </div>
      </div>

      {/* Main Game Stage */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 flex flex-col lg:flex-row gap-4 items-stretch overflow-hidden">
        {/* Left / Center: Drawing Board */}
        <section
          aria-label="Drawing Canvas Stage"
          className={`flex-1 min-h-0 flex flex-col gap-3 ${
            mobileTab === 'hub' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Canvas Wrapper */}
          <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-white/15 bg-[#141419] shadow-2xl flex items-center justify-center">
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

            {/* Idle Overlay: Start Game */}
            {gameState.status === 'idle' && (
              <div className="absolute inset-0 bg-[#0B0B10]/85 backdrop-blur-md flex flex-col items-center justify-center gap-4 p-6 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#FF9F1C] to-[#FFE66D] flex items-center justify-center text-[#0B0B10] shadow-2xl shadow-[#FF9F1C]/30 animate-bounce">
                  <Sparkles className="w-8 h-8 fill-current" />
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    Scribble & Guess Arena
                  </h2>
                  <p className="text-xs text-[#9A978F] leading-relaxed">
                    One room member sketches a secret word while others guess in real time. Earn points and claim 1st place!
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="default"
                  onClick={handleStartGame}
                  className="gap-2.5 px-8 py-3 rounded-2xl text-sm font-bold shadow-2xl shadow-[#FF9F1C]/30 hover:scale-105 transition-transform"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Match (5 Rounds)
                </Button>
              </div>
            )}

            {/* Round End Overlay */}
            {gameState.status === 'round_end' && (
              <div className="absolute inset-0 bg-[#0B0B10]/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-6 text-center animate-in zoom-in-95 duration-200">
                <span className="text-xs font-bold text-[#2EC4B6] uppercase tracking-widest bg-[#2EC4B6]/15 px-3 py-1 rounded-full border border-[#2EC4B6]/30">
                  Round Ended
                </span>
                <span className="text-xs text-[#9A978F]">The secret word was:</span>
                <h3 className="text-3xl font-black text-[#FF9F1C] font-mono tracking-widest drop-shadow-lg">
                  {gameState.word}
                </h3>
                <span className="text-xs text-[#9A978F] flex items-center gap-1.5 mt-2">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  Next round starting in a few seconds...
                </span>
              </div>
            )}
          </div>

          {/* Drawer Toolbar (Only visible when active drawer) */}
          {isDrawer && isRoundActive && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#1C1C24] rounded-2xl border border-white/10 shadow-xl shrink-0">
              {/* Palette */}
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setSelectedColor(color);
                      setIsEraser(false);
                    }}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer shrink-0 ${
                      selectedColor === color && !isEraser
                        ? 'scale-125 border-white ring-4 ring-[#FF9F1C]/40 shadow-lg'
                        : 'border-white/20 hover:scale-110'
                    }`}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>

              {/* Tools & Brush Sizes */}
              <div className="flex items-center gap-2">
                {BRUSH_SIZES.map((b) => (
                  <button
                    key={b.size}
                    type="button"
                    onClick={() => setBrushSize(b.size)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer transition-all ${
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-[#FF5A5F] hover:bg-[#FF5A5F]/15 font-bold text-xs cursor-pointer transition-all"
                  title="Clear Canvas"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>

                <button
                  type="button"
                  onClick={handleSkipRound}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-[#FFE66D] hover:bg-[#FFE66D]/15 font-bold text-xs cursor-pointer transition-all"
                  title="Skip Round"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Skip</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right: Hub (Leaderboard + Chat & Guesses) */}
        <aside
          aria-label="Scoreboard and Guess Chat"
          className={`w-full lg:w-80 lg:shrink-0 flex flex-col gap-3 min-h-0 ${
            mobileTab === 'board' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Live Scoreboard */}
          <div className="h-52 bg-[#141419] rounded-2xl border border-white/10 p-3 flex flex-col overflow-hidden shrink-0">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Trophy className="w-4 h-4 text-[#FFE66D]" />
                <span>Leaderboard</span>
              </div>
              <span className="text-[10px] text-[#9A978F]">{scoreboard.length} player(s)</span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
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
          </div>

          {/* Live Guess & Chat Stream */}
          <div className="flex-1 min-h-[160px] bg-[#141419] rounded-2xl border border-white/10 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-white/10 text-xs font-bold text-white">
              <Flame className="w-4 h-4 text-[#FF5A5F]" />
              <span>Live Guesses</span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 text-xs">
              {chatLog.length === 0 ? (
                <span className="text-[11px] text-[#9A978F] m-auto italic">
                  Guesses from players will roll in live...
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
              <div ref={chatBottomRef} />
            </div>

            {/* Guess Submission Input */}
            <form onSubmit={handleSendGuess} className="flex gap-2 pt-2 border-t border-white/10 mt-2">
              <Input
                type="text"
                placeholder={
                  isDrawer
                    ? 'You are drawing this round!'
                    : hasGuessed
                    ? 'You already guessed! Wait for round to end...'
                    : 'Type your guess here...'
                }
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                disabled={isDrawer || !isRoundActive || hasGuessed}
                className="flex-1 h-10 text-xs bg-[#1C1C24] border-white/10 text-white placeholder:text-[#9A978F]"
              />
              <Button
                type="submit"
                variant="primary"
                size="default"
                disabled={isDrawer || !isRoundActive || hasGuessed || !guessInput.trim()}
                className="h-10 px-4 shrink-0 rounded-xl"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {/* Reset / Status Footer */}
          <div className="flex items-center justify-between text-[11px] text-[#9A978F] px-1">
            <span>Signed in as <strong className="text-white">{displayName || 'Guest'}</strong></span>
            <button
              type="button"
              onClick={handleResetGame}
              className="flex items-center gap-1 hover:text-[#FF5A5F] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ScribbleArena;

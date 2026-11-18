import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  Palette,
  Eraser,
  Trash2,
  Send,
  Trophy,
  Play,
  RotateCcw,
  Sparkles,
  FastForward,
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
  { label: 'S', size: 3 },
  { label: 'M', size: 6 },
  { label: 'L', size: 12 },
];

export function ScribbleDrawer({ open, onOpenChange, socket }) {
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
  const [brushSize, setBrushSize] = useState(6);
  const [isEraser, setIsEraser] = useState(false);

  // Chat & Guesses
  const [guessInput, setGuessInput] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [activeTab, setActiveTab] = useState('game'); // 'game' | 'scores'

  const isDrawer = gameState.currentDrawerId === memberId;
  const isRoundActive = gameState.status === 'drawing';
  const hasGuessed = Array.isArray(gameState.guessedMemberIds) && gameState.guessedMemberIds.includes(memberId);

  // Helper to draw a line segment on canvas
  const drawSegment = useCallback((x0, y0, x1, y1, color, size) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.strokeStyle = color;
    ctx.lineWidth = size * (w / 600); // Scale with canvas width
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.stroke();
  }, []);

  // Redraw all historic strokes
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

  // Resize canvas when container dimensions change
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(Math.min(360, width * 0.65));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      redrawCanvas(gameState.drawHistory || []);
    }
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
      toast.success(`${data.displayName} guessed the word! 🎉`);
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
          text: `🏁 Round ended: The word was "${data.word}" (${data.reason})`,
        },
      ]);
      toast.info(`Round ended! Word was: ${data.word}`);
    };

    const handleMatchEnd = (data) => {
      toast.success('🏆 Match ended! Check final scores on the leaderboard.');
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
    const size = isEraser ? brushSize * 2 : brushSize;

    // Draw locally immediately
    drawSegment(lastPointRef.current.x, lastPointRef.current.y, x, y, color, size);

    // Emit over socket
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

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Scribble & Guess 🎨"
      description="Draw together and guess the secret word in real time!"
      className="max-w-2xl mx-auto h-[90dvh] flex flex-col"
    >
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        {/* Top Controls & Status Bar */}
        <div className="flex items-center justify-between bg-[#1C1C24] p-2 sm:p-2.5 rounded-xl border border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-[#FF9F1C] bg-[#FF9F1C]/15 px-2 py-0.5 rounded-md border border-[#FF9F1C]/30">
              Round {gameState.round || 1}/{gameState.maxRounds || 5}
            </span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded-md border ${
                gameState.timeRemaining <= 10
                  ? 'bg-[#FF5A5F]/20 text-[#FF5A5F] border-[#FF5A5F]/40 animate-pulse'
                  : 'bg-white/5 text-[#F4F1EA] border-white/10'
              }`}
            >
              ⏱️ {gameState.timeRemaining}s
            </span>
          </div>

          {/* Word / Clue Display */}
          <div className="flex-1 text-center px-2">
            {isDrawer ? (
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-[#2EC4B6] font-semibold uppercase tracking-wider">
                  You are drawing ({gameState.category || 'Secret'}):
                </span>
                <span className="text-sm font-extrabold text-[#FF9F1C] tracking-widest font-mono">
                  {gameState.word || 'Loading...'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-[#9A978F]">
                  {gameState.currentDrawerName
                    ? `${gameState.currentDrawerName} is drawing (${gameState.category || 'Secret'})`
                    : 'Waiting for round to start...'}
                </span>
                <span className="text-sm sm:text-base font-extrabold tracking-widest text-[#F4F1EA] font-mono">
                  {hasGuessed
                    ? `🎉 ${gameState.word}`
                    : gameState.maskedWord || '_ _ _ _ _'}
                </span>
              </div>
            )}
          </div>

          {/* Tab Switcher: Game / Scores */}
          <div className="flex items-center gap-1">
            <Button
              variant={activeTab === 'game' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('game')}
              className="h-8 px-2.5 text-[11px]"
            >
              <Palette className="w-3.5 h-3.5 mr-1" />
              Game
            </Button>
            <Button
              variant={activeTab === 'scores' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('scores')}
              className="h-8 px-2.5 text-[11px]"
            >
              <Trophy className="w-3.5 h-3.5 mr-1 text-[#FFE66D]" />
              Rank
            </Button>
          </div>
        </div>

        {activeTab === 'scores' ? (
          /* Leaderboard Tab */
          <div className="flex-1 overflow-y-auto bg-[#141419] rounded-2xl border border-white/10 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-[#FFE66D]" />
              <h3 className="text-sm font-bold text-[#F4F1EA]">Room Leaderboard</h3>
            </div>
            {scoreboard.length === 0 ? (
              <p className="text-xs text-[#9A978F] py-8 text-center">
                No scores yet. Start a match to score points!
              </p>
            ) : (
              scoreboard.map((player, idx) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    player.id === memberId
                      ? 'bg-[#FF9F1C]/15 border-[#FF9F1C]/40 text-[#F4F1EA]'
                      : 'bg-[#1C1C24] border-white/5 text-[#9A978F]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 font-bold text-xs font-mono">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-[#F4F1EA]">
                      {player.name} {player.id === memberId && '(You)'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sm text-[#FF9F1C]">
                    {player.score} pts
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Main Game Canvas & Chat Layout */
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {/* Canvas Container */}
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/15 bg-[#141419] shadow-inner flex items-center justify-center touch-none">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`w-full touch-none block ${
                  isDrawer && isRoundActive ? 'cursor-crosshair' : 'cursor-default'
                }`}
                style={{ touchAction: 'none' }}
              />

              {/* Idle Overlay with Start Button */}
              {gameState.status === 'idle' && (
                <div className="absolute inset-0 bg-[#0B0B10]/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <Sparkles className="w-8 h-8 text-[#FF9F1C] animate-bounce" />
                  <h4 className="text-base font-bold text-[#F4F1EA]">Ready to Scribble?</h4>
                  <p className="text-xs text-[#9A978F] max-w-xs">
                    One draws, everyone guesses! Compete for points and climb the room leaderboard.
                  </p>
                  <Button
                    variant="primary"
                    size="default"
                    onClick={handleStartGame}
                    className="gap-2 px-6 shadow-xl shadow-[#FF9F1C]/20"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start Party
                  </Button>
                </div>
              )}

              {/* Round End Overlay */}
              {gameState.status === 'round_end' && (
                <div className="absolute inset-0 bg-[#0B0B10]/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <span className="text-xs text-[#2EC4B6] font-semibold uppercase tracking-wider">
                    Round Over
                  </span>
                  <h4 className="text-xl font-extrabold text-[#FF9F1C] font-mono tracking-wider">
                    {gameState.word}
                  </h4>
                  <p className="text-xs text-[#9A978F]">Next round starting shortly...</p>
                </div>
              )}
            </div>

            {/* Drawer Tools Bar (Only visible when you are the drawer) */}
            {isDrawer && isRoundActive && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-[#1C1C24] rounded-xl border border-white/10">
                {/* Color Palette */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setSelectedColor(color);
                        setIsEraser(false);
                      }}
                      style={{ backgroundColor: color }}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer shrink-0 ${
                        selectedColor === color && !isEraser
                          ? 'scale-125 border-white ring-2 ring-[#FF9F1C]'
                          : 'border-white/20 hover:scale-110'
                      }`}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                </div>

                {/* Brush Sizes & Tools */}
                <div className="flex items-center gap-1.5">
                  {BRUSH_SIZES.map((b) => (
                    <button
                      key={b.size}
                      type="button"
                      onClick={() => setBrushSize(b.size)}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-colors ${
                        brushSize === b.size && !isEraser
                          ? 'bg-[#FF9F1C] text-[#0B0B10] border-[#FF9F1C]'
                          : 'bg-white/5 border-white/10 text-[#9A978F] hover:bg-white/10'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setIsEraser((prev) => !prev)}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      isEraser
                        ? 'bg-[#FF9F1C] text-[#0B0B10] border-[#FF9F1C]'
                        : 'bg-white/5 border-white/10 text-[#9A978F] hover:bg-white/10'
                    }`}
                    title="Eraser"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleClearCanvas}
                    className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-[#FF5A5F] hover:bg-[#FF5A5F]/20 cursor-pointer transition-colors"
                    title="Clear Canvas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipRound}
                    className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-[#FFE66D] hover:bg-[#FFE66D]/20 cursor-pointer transition-colors"
                    title="Skip Round"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Chat & Guess Feed */}
            <div className="flex-1 min-h-[100px] max-h-[140px] overflow-y-auto bg-[#141419] rounded-xl border border-white/10 p-2.5 flex flex-col gap-1.5 text-xs">
              {chatLog.length === 0 ? (
                <span className="text-[11px] text-[#9A978F] italic m-auto">
                  Guesses and game activity will appear here...
                </span>
              ) : (
                chatLog.map((msg) => (
                  <div
                    key={msg.id}
                    className={`leading-tight ${
                      msg.isCorrect
                        ? 'text-[#2EC4B6] font-bold bg-[#2EC4B6]/10 px-2 py-1 rounded-md border border-[#2EC4B6]/30'
                        : msg.isSystem
                        ? 'text-[#FF9F1C] font-semibold italic'
                        : 'text-[#F4F1EA]'
                    }`}
                  >
                    {!msg.isSystem && !msg.isCorrect && (
                      <span className="font-semibold text-[#9A978F] mr-1">
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
            <form onSubmit={handleSendGuess} className="flex gap-2">
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
                className="flex-1 h-10 text-xs bg-[#141419] border-white/10 text-[#F4F1EA] placeholder:text-[#9A978F]"
              />
              <Button
                type="submit"
                variant="primary"
                size="default"
                disabled={isDrawer || !isRoundActive || hasGuessed || !guessInput.trim()}
                className="h-10 px-4 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px] text-[#9A978F]">
          <span>Logged in as: <strong className="text-[#F4F1EA]">{displayName || 'Guest'}</strong></span>
          <button
            type="button"
            onClick={handleResetGame}
            className="flex items-center gap-1 hover:text-[#FF5A5F] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Match
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export default ScribbleDrawer;


import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { Button } from '../../components/Button';
import { useAppStore } from '../../stores/useAppStore';

function formatChatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMessageText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#FF9F1C] underline hover:text-[#ffb042] break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export function ChatDrawer({ socket, currentSocketId, currentMemberId }) {
  const chatMessages = useAppStore((s) => s.chatMessages);
  const resetUnreadChat = useAppStore((s) => s.resetUnreadChat);

  const [input, setInput] = useState('');
  const scrollContainerRef = useRef(null);
  const isUserScrolledUp = useRef(false);

  useEffect(() => {
    resetUnreadChat();
  }, [resetUnreadChat]);

  // Auto-scroll to bottom unless user has scrolled up
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && !isUserScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Consider scrolled up if more than 60px from bottom
    isUserScrolledUp.current = distanceToBottom > 60;
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !socket) return;
    if (trimmed.length > 500) return;

    socket.emit('chat:send', { text: trimmed });
    setInput('');
    isUserScrolledUp.current = false;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#141419]/90 select-text overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#FF9F1C]" />
          <span className="text-xs font-semibold text-[#F4F1EA] uppercase tracking-wider">
            Room Chat
          </span>
        </div>
        <span className="text-[10px] text-[#9A978F] font-mono">
          {chatMessages.length} msg
        </span>
      </div>

      {/* Messages list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar"
      >
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 select-none">
            <MessageSquare className="w-8 h-8 text-[#9A978F]/30 mb-2" />
            <p className="text-xs font-medium text-[#9A978F]">No messages yet</p>
            <p className="text-[11px] text-[#9A978F]/60 mt-0.5">
              Say hi to everyone in the room!
            </p>
          </div>
        ) : (
          chatMessages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div
                  key={msg.id}
                  className="flex items-center justify-center my-1 select-none"
                >
                  <span className="bg-white/5 border border-white/5 text-[10px] text-[#9A978F] px-2.5 py-0.5 rounded-full">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isOwn =
              msg.memberId === currentSocketId || msg.memberId === currentMemberId;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
              >
                {/* Sender Name and Time */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#9A978F]">
                  <span className="font-semibold text-[#F4F1EA]/80">{msg.name}</span>
                  <span>•</span>
                  <span>{formatChatTime(msg.ts)}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap ${
                    isOwn
                      ? 'bg-[#FF9F1C] text-[#0B0B10] rounded-br-xs font-medium'
                      : 'bg-[#1C1C24] text-[#F4F1EA] rounded-bl-xs border border-white/10'
                  }`}
                >
                  {renderMessageText(msg.text)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-white/10 bg-[#0B0B10]/60 shrink-0">
        <div className="relative flex flex-col gap-1">
          <div className="flex items-end gap-2 bg-[#1C1C24] border border-white/10 rounded-xl p-1.5 focus-within:border-[#FF9F1C] transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message... (Enter to send)"
              rows={1}
              maxLength={500}
              className="flex-1 bg-transparent px-2 py-1 text-xs text-[#F4F1EA] placeholder-[#9A978F] resize-none outline-none min-h-[36px] max-h-24 custom-scrollbar"
              aria-label="Chat message input"
            />
            <Button
              variant="primary"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="h-9 w-9 min-h-[36px] min-w-[36px] rounded-lg shrink-0"
              aria-label="Send chat message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* Character counter (shows at 450+) */}
          {input.length >= 450 && (
            <div className="flex justify-end px-1">
              <span
                className={`text-[10px] font-mono ${
                  input.length >= 500 ? 'text-[#FF5A5F]' : 'text-[#FF9F1C]'
                }`}
              >
                {input.length} / 500
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatDrawer;


import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Users, 
  Send, 
  Crown, 
  ShieldCheck, 
  Smile, 
  Sparkles,
  Lock,
  Unlock
} from 'lucide-react';
import socket from '../services/socket';

const QUICK_EMOJIS = ['🔥', '❤️', '🎧', '🕺', '👏', '🚀', '✨', '😂'];

export default function MembersAndChat({
  members = [],
  chatMessages = [],
  currentUser,
  isHost,
  djMode
}) {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'members'
  const [messageText, setMessageText] = useState('');
  const chatEndRef = useRef(null);

  // Auto scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!messageText.trim()) return;

    socket.emit('chat:message', { text: messageText });
    setMessageText('');
  };

  const handleSendReaction = (emoji) => {
    socket.emit('reaction:send', { emoji });
  };

  const handleToggleDjMode = () => {
    if (!isHost) return;
    socket.emit('settings:update', { djMode: !djMode });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80 border border-white/10 rounded-3xl p-5 backdrop-blur-xl shadow-xl">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 pb-4 border-b border-white/10">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 pb-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'chat'
              ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Room Chat</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 pb-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'members'
              ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Friends ({members.length})</span>
        </button>
      </div>

      {/* TAB 1: Chat */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0 pt-3">
          {/* Chat Message History */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 text-xs">
                <span>Say hello to the room!</span>
              </div>
            ) : (
              chatMessages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="text-center my-1.5">
                      <span className="text-[10px] text-zinc-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                const isMe = msg.senderId === currentUser?.id || msg.sender === currentUser?.name;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    {!isMe && (
                      <span className="text-[10px] font-semibold text-zinc-400 ml-1 mb-0.5">
                        {msg.sender}
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                        isMe
                          ? 'bg-violet-600 text-white rounded-br-none shadow-md shadow-violet-600/20'
                          : 'bg-white/10 text-zinc-200 rounded-bl-none border border-white/5'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Reaction Bar */}
          <div className="flex items-center gap-1.5 py-2 border-t border-white/5 overflow-x-auto no-scrollbar">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendReaction(emoji)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-lg transition-transform hover:scale-125 active:scale-95"
                title={`Send ${emoji} to screen`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="relative mt-1">
            <input
              type="text"
              placeholder="Send message to room..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-3.5 pr-10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
            />
            <button
              type="submit"
              disabled={!messageText.trim()}
              className="absolute right-1.5 top-1.5 p-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-all"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: Members List & Room Controls */}
      {activeTab === 'members' && (
        <div className="flex-1 flex flex-col min-h-0 pt-3">
          {/* DJ Mode Switch for Host */}
          {isHost && (
            <div className="mb-4 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  {djMode ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-zinc-400" />}
                  <span>Host DJ Control</span>
                </h4>
                <p className="text-[10px] text-zinc-400">
                  {djMode ? 'Only you can play, pause, or seek' : 'All friends can control playback'}
                </p>
              </div>

              <button
                onClick={handleToggleDjMode}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  djMode ? 'bg-violet-600' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    djMode ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* List of Connected Members */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: member.avatarColor || '#8b5cf6' }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white">
                        {member.name}
                      </span>
                      {member.isHost && (
                        <Crown className="w-3 h-3 text-amber-400 fill-amber-400" title="Room Host" />
                      )}
                      {member.id === currentUser?.id && (
                        <span className="text-[9px] text-violet-400 font-mono font-bold">(You)</span>
                      )}
                    </div>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      Listening
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


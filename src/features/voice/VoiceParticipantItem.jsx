import React from 'react';
import { useIsSpeaking, useConnectionQualityIndicator } from '@livekit/components-react';
import { ConnectionQuality } from 'livekit-client';
import { Mic, MicOff, Wifi, WifiOff } from 'lucide-react';
import { Avatar } from '../../components/Avatar';

function LiveKitVoiceItem({ participant, isSelf }) {
  const isSpeaking = useIsSpeaking(participant);
  const { quality } = useConnectionQualityIndicator({ participant });
  const displayName = participant?.name || 'Anonymous';
  const isMicEnabled = Boolean(participant?.isMicrophoneEnabled);

  const getQualityColor = () => {
    if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) {
      return 'text-[#2EC4B6]';
    }
    if (quality === ConnectionQuality.Poor) {
      return 'text-[#FF9F1C]';
    }
    if (quality === ConnectionQuality.Lost) {
      return 'text-[#FF5A5F]';
    }
    return 'text-[#2EC4B6]';
  };

  return (
    <div
      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
        isSelf
          ? 'bg-[#1C1C24] border-white/10'
          : 'bg-[#141419]/60 border-white/5 hover:border-white/10'
      } ${isSpeaking ? 'ring-1 ring-[#2EC4B6]' : ''}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative">
          <Avatar
            fallback={displayName.slice(0, 2)}
            color="#FF9F1C"
            className="w-8 h-8 text-xs shrink-0"
          />
          {isSpeaking && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2EC4B6] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#2EC4B6]" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-[#F4F1EA] truncate">
              {displayName}
            </p>
            {isSelf && (
              <span className="text-[10px] text-[#FF9F1C] font-semibold bg-[#FF9F1C]/10 px-1 rounded">
                You
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#9A978F]">
            {isSpeaking ? 'Speaking...' : isMicEnabled ? 'Listening' : 'Muted'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {quality === ConnectionQuality.Lost ? (
          <WifiOff className="w-3.5 h-3.5 text-[#FF5A5F]" />
        ) : (
          <Wifi className={`w-3.5 h-3.5 ${getQualityColor()}`} />
        )}

        {isMicEnabled ? (
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isSpeaking ? 'bg-[#2EC4B6]/20' : 'bg-white/10'
            }`}
          >
            <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-[#2EC4B6]' : 'text-[#F4F1EA]'}`} />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
            <MicOff className="w-3.5 h-3.5 text-[#9A978F]" />
          </div>
        )}
      </div>
    </div>
  );
}

function FallbackVoiceItem({ fallbackMember, isSelf }) {
  const displayName = fallbackMember?.displayName || 'Anonymous';
  const isOnline = fallbackMember?.isOnline !== false;
  const isSpeaking = Boolean(fallbackMember?.isSpeaking);
  const isMicEnabled = Boolean(fallbackMember?.isMicEnabled);

  return (
    <div
      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
        isSelf
          ? 'bg-[#1C1C24] border-white/10'
          : 'bg-[#141419]/60 border-white/5 hover:border-white/10'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar
          fallback={displayName.slice(0, 2)}
          color="#FF9F1C"
          className="w-8 h-8 text-xs shrink-0"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-[#F4F1EA] truncate">
              {displayName}
            </p>
            {isSelf && (
              <span className="text-[10px] text-[#FF9F1C] font-semibold bg-[#FF9F1C]/10 px-1 rounded">
                You
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#9A978F]">
            {isOnline ? (isMicEnabled ? 'Live' : 'Muted') : 'Offline'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isOnline ? (
          <Wifi className="w-3.5 h-3.5 text-[#2EC4B6]" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-[#9A978F]" />
        )}

        {isMicEnabled ? (
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isSpeaking ? 'bg-[#2EC4B6]/20' : 'bg-white/10'
            }`}
          >
            <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-[#2EC4B6]' : 'text-[#F4F1EA]'}`} />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
            <MicOff className="w-3.5 h-3.5 text-[#9A978F]" />
          </div>
        )}
      </div>
    </div>
  );
}

export function VoiceParticipantItem({ participant, fallbackMember, isSelf }) {
  if (participant) {
    return <LiveKitVoiceItem participant={participant} isSelf={isSelf} />;
  }
  return <FallbackVoiceItem fallbackMember={fallbackMember} isSelf={isSelf} />;
}

export default VoiceParticipantItem;

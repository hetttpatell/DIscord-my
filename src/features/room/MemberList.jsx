import React from 'react';
import { useParticipants, useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Badge } from '../../components/Badge';
import { VoiceParticipantItem } from '../voice/VoiceParticipantItem';
import { useVoiceContext } from '../voice/VoiceContext';

function LiveKitMembersList({ currentMemberId, socketMembers }) {
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const isReconnecting = connectionState === ConnectionState.Reconnecting;

  const count = participants.length > 0 ? participants.length : socketMembers.length;

  return (
    <div className="flex flex-col h-full w-full p-2 space-y-2 select-none">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-[#9A978F] uppercase tracking-wider">
          Room Members ({count})
        </span>
        {isReconnecting && (
          <Badge variant="destructive" className="animate-pulse text-[10px]">
            Reconnecting voice...
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
        {participants.length > 0
          ? participants.map((p) => (
              <VoiceParticipantItem
                key={p.identity}
                participant={p}
                isSelf={p.identity === currentMemberId || p.isLocal}
              />
            ))
          : socketMembers.map((member) => (
              <VoiceParticipantItem
                key={member.memberId}
                fallbackMember={member}
                isSelf={member.memberId === currentMemberId}
              />
            ))}
      </div>
    </div>
  );
}

function FallbackMembersList({ members, currentMemberId }) {
  return (
    <div className="flex flex-col h-full w-full p-2 space-y-2 select-none">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-[#9A978F] uppercase tracking-wider">
          Room Members ({members.length})
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
        {members.map((member) => (
          <VoiceParticipantItem
            key={member.memberId}
            fallbackMember={member}
            isSelf={member.memberId === currentMemberId}
          />
        ))}
      </div>
    </div>
  );
}

export function MemberList({ members = [], currentMemberId }) {
  const { isLiveKitActive } = useVoiceContext();
  if (isLiveKitActive) {
    return <LiveKitMembersList currentMemberId={currentMemberId} socketMembers={members} />;
  }
  return <FallbackMembersList members={members} currentMemberId={currentMemberId} />;
}

export default MemberList;

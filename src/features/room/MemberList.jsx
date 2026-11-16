import React from 'react';
import { useParticipants, useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { Badge } from '../../components/Badge';
import { VoiceParticipantItem } from '../voice/VoiceParticipantItem';
import { useVoiceContext } from '../voice/VoiceContext';

function normalizeMembers(members) {
  if (Array.isArray(members)) return members;
  if (members && Array.isArray(members.members)) return members.members;
  if (members && typeof members === 'object') return Object.values(members);
  return [];
}

function LiveKitMembersList({ currentMemberId, socketMembers }) {
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const isReconnecting = connectionState === ConnectionState.Reconnecting;

  const validSocketMembers = normalizeMembers(socketMembers);
  const count = participants.length > 0 ? participants.length : validSocketMembers.length;

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
          : validSocketMembers.map((member, idx) => (
              <VoiceParticipantItem
                key={member.memberId || member.id || member.displayName || `member-${idx}`}
                fallbackMember={member}
                isSelf={member.memberId === currentMemberId || member.id === currentMemberId}
              />
            ))}
      </div>
    </div>
  );
}

function FallbackMembersList({ members, currentMemberId }) {
  const memberList = normalizeMembers(members);

  return (
    <div className="flex flex-col h-full w-full p-2 space-y-2 select-none">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-[#9A978F] uppercase tracking-wider">
          Room Members ({memberList.length})
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
        {memberList.map((member, idx) => (
          <VoiceParticipantItem
            key={member.memberId || member.id || member.displayName || `member-${idx}`}
            fallbackMember={member}
            isSelf={member.memberId === currentMemberId || member.id === currentMemberId}
          />
        ))}
      </div>
    </div>
  );
}

export function MemberList({ members = [], currentMemberId }) {
  const { isLiveKitActive } = useVoiceContext();
  const safeMembers = normalizeMembers(members);
  if (isLiveKitActive) {
    return <LiveKitMembersList currentMemberId={currentMemberId} socketMembers={safeMembers} />;
  }
  return <FallbackMembersList members={safeMembers} currentMemberId={currentMemberId} />;
}

export default MemberList;

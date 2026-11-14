import React from 'react';

export const VoiceContext = React.createContext({
  isLiveKitActive: false,
  room: null,
});

export const useVoiceContext = () => React.useContext(VoiceContext);
export default VoiceContext;


import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mic, 
  Video, 
  Volume2, 
  Settings, 
  ShieldCheck, 
  Wifi, 
  Check, 
  SwitchCamera,
  Play,
  Info
} from 'lucide-react';
import mediaService from '../services/mediaService.js';
import mediaController from '../services/mediaController.js';

export default function MeetingSettingsModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateUserName,
  activeEngine = 'webrtc',
  isSecureContext = true
}) {
  const [activeTab, setActiveTab] = useState('audio'); // 'audio' | 'video' | 'general'
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedMic, setSelectedMic] = useState(() => mediaController.getState().selectedMicId || '');
  const [selectedCamera, setSelectedCamera] = useState(() => mediaController.getState().selectedCameraId || '');
  const [selectedSpeaker, setSelectedSpeaker] = useState(() => mediaController.getState().selectedSpeakerId || '');
  const [testAudioPlaying, setTestAudioPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser?.name || '');

  const previewVideoRef = useRef(null);
  const supportsSinkId = typeof HTMLAudioElement !== 'undefined' && 'setSinkId' in HTMLAudioElement.prototype;

  useEffect(() => {
    if (!isOpen) return;

    mediaService.enumerateDevices().then(devs => {
      setDevices(devs);
      const state = mediaController.getState();
      if (devs.audioInputs.length > 0 && !state.selectedMicId) {
        setSelectedMic(devs.audioInputs[0].deviceId);
      } else if (state.selectedMicId) {
        setSelectedMic(state.selectedMicId);
      }

      if (devs.videoInputs.length > 0 && !state.selectedCameraId) {
        setSelectedCamera(devs.videoInputs[0].deviceId);
      } else if (state.selectedCameraId) {
        setSelectedCamera(state.selectedCameraId);
      }

      if (devs.audioOutputs?.length > 0 && !state.selectedSpeakerId) {
        setSelectedSpeaker(devs.audioOutputs[0].deviceId);
      } else if (state.selectedSpeakerId) {
        setSelectedSpeaker(state.selectedSpeakerId);
      }
    });

    const unsub = mediaController.subscribe((event, payload, state) => {
      if (event === 'speaking') {
        setIsSpeaking(Boolean(payload?.isSpeaking));
      } else if (event === 'stream-changed' || event === 'device-changed') {
        const cur = state || mediaController.getState();
        if (cur.selectedMicId) setSelectedMic(cur.selectedMicId);
        if (cur.selectedCameraId) setSelectedCamera(cur.selectedCameraId);
        if (cur.selectedSpeakerId) setSelectedSpeaker(cur.selectedSpeakerId);

        if (previewVideoRef.current && cur.stream) {
          previewVideoRef.current.srcObject = cur.stream;
          previewVideoRef.current.play().catch(() => {});
        }
      }
    });

    return () => unsub();
  }, [isOpen]);

  // Bind local preview in video tab
  useEffect(() => {
    if (activeTab === 'video' && previewVideoRef.current && mediaController.stream) {
      previewVideoRef.current.srcObject = mediaController.stream;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [activeTab]);

  // Test speaker playback with Web Audio synth chime
  const playSpeakerTestChime = async () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (selectedSpeaker && typeof ctx.setSinkId === 'function') {
        try {
          await ctx.setSinkId(selectedSpeaker);
        } catch {
          // ignore setSinkId errors
        }
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      setTestAudioPlaying(true);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);

      setTimeout(() => {
        setTestAudioPlaying(false);
        ctx.close().catch(() => {});
      }, 500);
    } catch (e) {
      console.warn('Audio test chime error:', e);
    }
  };

  const handleMicChange = async (e) => {
    const deviceId = e.target.value;
    setSelectedMic(deviceId);
    await mediaController.setAudioInput(deviceId);
  };

  const handleCameraChange = async (e) => {
    const deviceId = e.target.value;
    setSelectedCamera(deviceId);
    await mediaController.setVideoInput(deviceId);
  };

  const handleSpeakerChange = (e) => {
    const deviceId = e.target.value;
    setSelectedSpeaker(deviceId);
    mediaController.setAudioOutput(deviceId);
  };

  const handleSaveName = (e) => {
    e.preventDefault();
    if (nameInput.trim() && onUpdateUserName) {
      onUpdateUserName(nameInput.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg bg-[#202124] border border-[#3c4043] rounded-3xl shadow-2xl overflow-hidden flex flex-col text-[#e8eaed]">
        
        {/* Header */}
        <div className="h-14 px-6 border-b border-[#3c4043] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-[#8ab4f8]" />
            <h2 className="text-base font-bold text-white">Call Settings &amp; Devices</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043]/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 p-1.5 bg-[#171717] border-b border-[#3c4043]/50 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-[#3c4043] text-white shadow'
                : 'text-[#9aa0a6] hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4 text-[#8ab4f8]" />
            <span>Audio</span>
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={`py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'video'
                ? 'bg-[#3c4043] text-white shadow'
                : 'text-[#9aa0a6] hover:text-white'
            }`}
          >
            <Video className="w-4 h-4 text-[#8ab4f8]" />
            <span>Video</span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'general'
                ? 'bg-[#3c4043] text-white shadow'
                : 'text-[#9aa0a6] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-[#8ab4f8]" />
            <span>General</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-5">
          {/* 1. AUDIO TAB */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-white block mb-1.5">
                  Microphone Input Device
                </label>
                <select
                  value={selectedMic}
                  onChange={handleMicChange}
                  className="w-full bg-[#303134] border border-[#5f6368] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8ab4f8]"
                >
                  {devices.audioInputs.length === 0 ? (
                    <option value="">Default Microphone</option>
                  ) : (
                    devices.audioInputs.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Live Audio Meter */}
              <div className="p-3 rounded-xl bg-[#303134]/50 border border-[#3c4043] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Mic className={`w-4 h-4 ${isSpeaking ? 'text-[#34a853]' : 'text-[#9aa0a6]'}`} />
                  <span className="text-xs font-medium text-white">Input Level</span>
                </div>
                <div className="flex items-center gap-1 w-32 h-3 bg-black/40 rounded-full px-1 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-100 ${
                      isSpeaking ? 'w-full bg-[#34a853]' : 'w-2 bg-[#9aa0a6]/30'
                    }`}
                  />
                </div>
              </div>

              {/* Speaker Output Device (if supported) */}
              {supportsSinkId && devices.audioOutputs && devices.audioOutputs.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5">
                    Audio Output Destination (Speakers / Headphones)
                  </label>
                  <select
                    value={selectedSpeaker}
                    onChange={handleSpeakerChange}
                    className="w-full bg-[#303134] border border-[#5f6368] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8ab4f8]"
                  >
                    {devices.audioOutputs.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Speaker ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Speaker Test */}
              <div className="pt-2">
                <label className="text-xs font-bold text-white block mb-1.5">
                  Speakers &amp; Audio Output Check
                </label>
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#303134]/50 border border-[#3c4043]">
                  <div className="flex items-center gap-2 text-xs text-[#9aa0a6]">
                    <Volume2 className="w-4 h-4 text-white" />
                    <span>
                      {selectedSpeaker
                        ? devices.audioOutputs?.find(d => d.deviceId === selectedSpeaker)?.label || 'Selected Audio Output'
                        : 'Default System Output'}
                    </span>
                  </div>
                  <button
                    onClick={playSpeakerTestChime}
                    disabled={testAudioPlaying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3c4043] hover:bg-[#4a4e52] text-xs font-bold text-white transition-all active:scale-95 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-[#8ab4f8]" />
                    <span>{testAudioPlaying ? 'Playing...' : 'Test Speakers'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#8ab4f8]/10 border border-[#8ab4f8]/20 flex items-start gap-2 text-xs text-[#8ab4f8]">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Acoustic Echo Cancellation (AEC) and Noise Suppression are active to prevent audio feedback while music plays.</span>
              </div>
            </div>
          )}

          {/* 2. VIDEO TAB */}
          {activeTab === 'video' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-white block mb-1.5">
                  Camera Device
                </label>
                <select
                  value={selectedCamera}
                  onChange={handleCameraChange}
                  className="w-full bg-[#303134] border border-[#5f6368] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8ab4f8]"
                >
                  {devices.videoInputs.length === 0 ? (
                    <option value="">Default Camera</option>
                  ) : (
                    devices.videoInputs.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Camera Preview */}
              <div>
                <label className="text-xs font-bold text-white block mb-1.5">
                  Camera Preview
                </label>
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#3c4043] flex items-center justify-center">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <button
                    onClick={() => mediaController.switchCamera()}
                    className="absolute bottom-2 right-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-black/90 active:scale-95 shadow cursor-pointer"
                  >
                    <SwitchCamera className="w-3.5 h-3.5" />
                    <span>Flip Camera</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Display Name */}
              <form onSubmit={handleSaveName} className="space-y-2">
                <label className="text-xs font-bold text-white block">
                  Your Display Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="flex-1 bg-[#303134] border border-[#5f6368] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8ab4f8]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124] font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>

              {/* System Diagnostics */}
              <div className="pt-2">
                <label className="text-xs font-bold text-white block mb-1.5">
                  System Diagnostics
                </label>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#303134]/50 border border-[#3c4043]">
                    <span className="text-[#9aa0a6]">Real-time Media Engine</span>
                    <span className="font-bold text-[#8ab4f8] uppercase font-mono">
                      {activeEngine === 'livekit' ? 'LiveKit SFU' : 'Native WebRTC'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#303134]/50 border border-[#3c4043]">
                    <span className="text-[#9aa0a6]">Secure Origin (HTTPS)</span>
                    <span className={`font-bold flex items-center gap-1 ${isSecureContext ? 'text-[#34a853]' : 'text-[#f2994a]'}`}>
                      {isSecureContext ? <Check className="w-3.5 h-3.5" /> : null}
                      <span>{isSecureContext ? 'Verified Secure' : 'Insecure LAN HTTP'}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#303134]/50 border border-[#3c4043]">
                    <span className="text-[#9aa0a6]">Connection Status</span>
                    <span className="font-bold text-[#34a853] flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5" />
                      <span>Connected</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-[#3c4043] flex items-center justify-end bg-[#171717] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124] font-bold text-xs shadow transition-all active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}

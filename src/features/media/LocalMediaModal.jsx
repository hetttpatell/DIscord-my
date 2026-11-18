import React, { useState, useRef } from 'react';
import { Film, Upload, Play, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export function LocalMediaModal({ open, onOpenChange, onStartShare }) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const processSelectedFile = (file) => {
    if (!file) return;

    const isVideoType = file.type && file.type.startsWith('video/');
    const isVideoExt = file.name && file.name.match(/\.(mp4|webm|mkv|mov|avi|m4v|3gp|ogv)$/i);

    if (!isVideoType && !isVideoExt) {
      setErrorMsg('Please select a valid video file (MP4, WebM, MOV, MKV).');
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleStart = () => {
    if (!selectedFile) return;
    onStartShare(selectedFile);
    onOpenChange(false);
    setSelectedFile(null);
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setErrorMsg(null);
    setIsDragging(false);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleCancel();
        else onOpenChange(true);
      }}
      title="Share Local Video File"
      description="Stream a movie or clip directly to everyone in this room without storing any files on the server."
    >
      <div className="flex flex-col gap-4 p-2 pb-6 select-none">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.webm,.mkv,.mov,.avi,.m4v"
          className="hidden"
          onChange={handleFileChange}
        />

        {!selectedFile ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group active:scale-[0.99] ${
              isDragging
                ? 'border-[#FF9F1C] bg-[#FF9F1C]/10 scale-[1.01]'
                : 'border-white/15 hover:border-[#FF9F1C]/60 bg-[#0B0B10]/50 hover:bg-[#141419]'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-[#FF9F1C]/10 border border-[#FF9F1C]/20 flex items-center justify-center text-[#FF9F1C] group-hover:scale-110 transition-transform shadow-lg shadow-[#FF9F1C]/10">
              <Upload className="w-7 h-7" />
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold text-[#F4F1EA]">
                {isDragging ? 'Drop video file here' : 'Tap to pick or drop a video file'}
              </p>
              <p className="text-xs text-[#9A978F] mt-1">
                Choose from your phone gallery or computer files
              </p>
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#9A978F] font-mono">
                MP4
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#9A978F] font-mono">
                WebM
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#9A978F] font-mono">
                MOV
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#9A978F] font-mono">
                MKV
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Selected File Card */}
            <div className="p-4 rounded-2xl bg-[#1C1C24] border border-white/10 flex items-start gap-3 shadow-lg">
              <div className="w-10 h-10 rounded-xl bg-[#2EC4B6]/20 border border-[#2EC4B6]/30 flex items-center justify-center text-[#2EC4B6] shrink-0 mt-0.5">
                <Film className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-[#F4F1EA] truncate">
                    {selectedFile.name}
                  </p>
                  <CheckCircle2 className="w-4 h-4 text-[#2EC4B6] shrink-0" />
                </div>
                <p className="text-xs text-[#9A978F] mt-0.5">
                  Size: {formatFileSize(selectedFile.size)} • Type: {selectedFile.type || 'Video'}
                </p>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2EC4B6]/15 border border-[#2EC4B6]/30 text-[10px] text-[#2EC4B6] font-semibold">
                  <span>Ready to stream live</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="primary"
                onClick={handleStart}
                className="flex-1 h-12 text-sm font-bold gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Watchparty
              </Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                className="h-12 px-4 text-xs font-semibold"
              >
                Change File
              </Button>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-[#FF5A5F] px-1 font-medium">
            {errorMsg}
          </p>
        )}

        {/* Privacy & Zero-Storage Guarantee */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-[#9A978F] leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-[#2EC4B6] shrink-0 mt-0.5" />
          <span>
            <strong>Zero Server Storage:</strong> Your video streams directly from your device’s memory via peer-to-peer WebRTC. Nothing is uploaded or saved to any database.
          </span>
        </div>
      </div>
    </Sheet>
  );
}

export default LocalMediaModal;


import React, { useState } from 'react';
import { 
  Key, 
  X, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ShieldAlert, 
  Sparkles,
  Info
} from 'lucide-react';
import { searchYouTube } from '../services/youtube';

export default function ApiKeyModal({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey
}) {
  const [inputValue, setInputValue] = useState(apiKey || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!inputValue.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key first' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const results = await searchYouTube('lofi', inputValue.trim());
      if (results && results.length > 0) {
        setTestResult({ success: true, message: 'API Key is valid and working perfectly!' });
      } else {
        setTestResult({ success: false, message: 'Key accepted, but search returned empty results.' });
      }
    } catch (err) {
      setTestResult({ 
        success: false, 
        message: err.message || 'Invalid API Key or YouTube Data API v3 is not enabled on this project.' 
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSaveApiKey(inputValue.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">YouTube API Key Setup</h2>
              <p className="text-xs text-zinc-400">Required for live catalog searches</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Guide */}
        <div className="py-4 space-y-4">
          <div className="p-4 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-xs text-violet-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-violet-300">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span>How to get a FREE YouTube Data API v3 Key:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-zinc-300">
              <li>
                Open the{' '}
                <a 
                  href="https://console.cloud.google.com/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-violet-400 underline underline-offset-2 inline-flex items-center gap-1 font-semibold hover:text-violet-300"
                >
                  Google Cloud Console <ExternalLink className="w-3 h-3" />
                </a>{' '}
                and create a project (or select an existing one).
              </li>
              <li>
                Go to <span className="font-semibold text-white">APIs & Services &gt; Library</span>, search for <span className="font-semibold text-white">YouTube Data API v3</span>, and click <span className="font-semibold text-white">Enable</span>.
              </li>
              <li>
                Go to <span className="font-semibold text-white">APIs & Services &gt; Credentials</span>, click <span className="font-semibold text-white">+ Create Credentials &gt; API Key</span>.
              </li>
              <li>Copy that key and paste it below!</li>
            </ol>
          </div>

          {/* Key Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">
              Your YouTube Data API Key:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="AIzaSy..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              />
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTesting || !inputValue.trim()}
                className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Key'}
              </button>
            </div>
          </div>

          {/* Test Status feedback */}
          {testResult && (
            <div 
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                testResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Friendly note */}
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-zinc-800/40 border border-white/5 text-[11px] text-zinc-400">
            <Info className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Note:</strong> You can still listen together even without an API key by pasting direct YouTube URLs or picking from the curated instant hits tab!
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/30 transition-all"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}


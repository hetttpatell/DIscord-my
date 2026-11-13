import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modKey = isMac ? '⌘' : 'Ctrl';
  const altKey = isMac ? '⌥' : 'Alt';

  const shortcuts = [
    {
      description: 'Turn microphone on or off',
      keys: [modKey, 'D']
    },
    {
      description: 'Turn camera on or off',
      keys: [modKey, 'E']
    },
    {
      description: 'Raise or lower hand',
      keys: [modKey, altKey, 'H']
    },
    {
      description: 'Show or hide People panel',
      keys: [modKey, altKey, 'P']
    },
    {
      description: 'Show or hide Chat panel',
      keys: [modKey, altKey, 'C']
    },
    {
      description: 'Close active panel or menu',
      keys: ['Esc']
    },
    {
      description: 'Open keyboard shortcuts',
      keys: ['?']
    }
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div 
        className="relative w-full max-w-md bg-[#202124] border border-[#3c4043] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3c4043]">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-[#8ab4f8]" />
            <h2 id="shortcuts-title" className="text-base font-medium text-[#e8eaed]">
              Keyboard shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-6 overflow-y-auto max-h-[70vh] divide-y divide-[#3c4043]/50">
          {shortcuts.map((sc, idx) => (
            <div key={idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-[#e8eaed]">{sc.description}</span>
              <div className="flex items-center gap-1">
                {sc.keys.map((k, kIdx) => (
                  <kbd
                    key={kIdx}
                    className="min-w-[28px] h-7 px-2 flex items-center justify-center rounded-md bg-[#303134] border border-[#5f6368]/40 text-xs font-mono font-medium text-[#e8eaed] shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#171717] border-t border-[#3c4043] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124] text-xs font-semibold transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}


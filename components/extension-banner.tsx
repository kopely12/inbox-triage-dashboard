'use client';

import { useState, useEffect } from 'react';
import { Puzzle, X, ArrowUpRight } from 'lucide-react';

const STORAGE_KEY = 'extension_banner_dismissed';
const CWS_URL     = 'https://chromewebstore.google.com/detail/iinbox/PLACEHOLDER';

export function ExtensionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  if (!visible) return null;

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-violet-600 text-white px-4 py-2 text-sm font-medium shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Puzzle className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Get the full iinbox experience —{' '}
          <a
            href={CWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white/80 inline-flex items-center gap-0.5"
          >
            install the Chrome extension
            <ArrowUpRight className="w-3 h-3" />
          </a>
        </span>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

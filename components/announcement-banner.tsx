'use client';

import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import type { AnnouncementType } from '@/lib/get-announcement';

type Props = {
  announcement: {
    message:   string;
    type:      AnnouncementType;
    updatedAt: string;
  } | null;
};

const STYLE_MAP: Record<AnnouncementType, {
  bar:  string;
  icon: React.ElementType;
}> = {
  info:    { bar: 'bg-blue-600 text-white',    icon: Info          },
  warning: { bar: 'bg-amber-500 text-white',   icon: AlertTriangle },
  error:   { bar: 'bg-red-600 text-white',     icon: XCircle       },
  success: { bar: 'bg-emerald-600 text-white', icon: CheckCircle2  },
};

const STORAGE_KEY = 'dismissed_announcement_at';

export function AnnouncementBanner({ announcement }: Props) {
  // Start hidden to prevent a flash of the banner on SSR before localStorage is read.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!announcement) return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    // Show if the user has never dismissed, or if the announcement was updated
    // since they last dismissed (meaning new content — they should see it again).
    if (dismissed !== announcement.updatedAt) {
      setVisible(true);
    }
  }, [announcement]);

  if (!announcement || !visible) return null;

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, announcement!.updatedAt);
    setVisible(false);
  }

  const { bar, icon: Icon } = STYLE_MAP[announcement.type] ?? STYLE_MAP.info;

  return (
    <div className={`flex items-center justify-between gap-3 ${bar} px-4 py-2 text-sm font-medium shrink-0`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{announcement.message}</span>
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

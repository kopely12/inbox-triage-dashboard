'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UserRound, X, Loader2 } from 'lucide-react';

export function ImpersonationBanner() {
  const { data: session, update } = useSession();
  const router                    = useRouter();
  const [loading, setLoading]     = useState(false);

  const imp = session?.user?.impersonating;
  if (!imp) return null;

  async function handleStop() {
    setLoading(true);
    try {
      await update({ stopImpersonation: true });
      router.push('/admin');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 text-white px-4 py-2 text-sm font-medium shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <UserRound className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Viewing as <strong>{imp.name || imp.email}</strong>
          <span className="font-normal opacity-80 ml-1.5 hidden sm:inline">({imp.email})</span>
        </span>
      </div>
      <button
        onClick={handleStop}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-xs font-medium disabled:opacity-50 shrink-0 whitespace-nowrap"
      >
        {loading
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <X className="w-3 h-3" />
        }
        Stop impersonating
      </button>
    </div>
  );
}

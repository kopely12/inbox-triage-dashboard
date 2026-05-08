'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { canImpersonate } from '@/app/actions/impersonation';
import { toast } from 'sonner';
import { UserRound, Loader2 } from 'lucide-react';

type Props = {
  userId:   string;
  userName: string;
};

export function ImpersonateButton({ userId, userName }: Props) {
  const { update }            = useSession();
  const router                = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const check = await canImpersonate(userId);
      if (!check.ok) {
        toast.error(check.error);
        return;
      }

      await update({ startImpersonation: userId });
      router.push('/account');
      router.refresh();
    } catch {
      toast.error('Failed to start impersonation. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={`View app as ${userName}`}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <UserRound className="w-3.5 h-3.5" />
      }
    </button>
  );
}

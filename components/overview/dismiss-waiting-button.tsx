'use client';

import { useTransition } from 'react';
import { toast }         from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { Button }        from '@/components/ui/button';
import { dismissWaitingItem } from '@/app/actions/waiting';

export function DismissWaitingButton({ id }: { id: string }) {
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="Mark as resolved — no longer waiting"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await dismissWaitingItem(id);
          if (res.error) toast.error(res.error);
          else toast.success('Marked resolved');
        })
      }
    >
      {pending
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Check   className="w-3 h-3" />}
    </Button>
  );
}

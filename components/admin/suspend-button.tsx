'use client';

import { useState, useTransition } from 'react';
import { suspendUser, unsuspendUser } from '@/app/actions/admin';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { PauseCircle, PlayCircle, Loader2 } from 'lucide-react';

export function SuspendButton({
  userId,
  email,
  suspendedAt,
}: {
  userId:      string;
  email:       string;
  suspendedAt: string | null;
}) {
  const [open, setOpen]            = useState(false);
  const [pending, startTransition] = useTransition();
  const isSuspended                = Boolean(suspendedAt);

  function handleUnsuspend() {
    startTransition(async () => {
      try {
        await unsuspendUser(userId);
        toast.success(`${email} can now log in again`);
      } catch {
        toast.error('Failed to unsuspend user');
      }
    });
  }

  function handleSuspend() {
    startTransition(async () => {
      try {
        await suspendUser(userId);
        toast.success(`${email} has been suspended`);
        setOpen(false);
      } catch {
        toast.error('Failed to suspend user');
      }
    });
  }

  // Unsuspend: no confirmation needed — it's safe
  if (isSuspended) {
    return (
      <button
        onClick={handleUnsuspend}
        disabled={pending}
        title="Unsuspend user"
        className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
      >
        {pending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <PlayCircle className="w-3.5 h-3.5" />
        }
      </button>
    );
  }

  // Suspend: requires confirmation
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Suspend user"
        className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
      >
        <PauseCircle className="w-3.5 h-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend user?</DialogTitle>
            <DialogDescription>
              <strong>{email}</strong> will be immediately blocked from logging in. Their data is
              preserved and you can unsuspend them at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleSuspend}
              disabled={pending}
            >
              {pending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Suspending…</>
                : 'Suspend account'
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

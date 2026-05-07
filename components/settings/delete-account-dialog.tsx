'use client';

import { useTransition, useState } from 'react';
import { signOut } from 'next-auth/react';
import { deleteAccount } from '@/app/actions/settings';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2 } from 'lucide-react';

export function DeleteAccountDialog() {
  const [open,       setOpen]    = useState(false);
  const [confirm,    setConfirm] = useState('');
  const [error,      setError]   = useState<string | null>(null);
  const [pending,    startTransition] = useTransition();

  const CONFIRM_WORD = 'DELETE';
  const ready = confirm === CONFIRM_WORD;

  function handleOpenChange(val: boolean) {
    if (!val) { setConfirm(''); setError(null); }
    setOpen(val);
  }

  function submit() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      if (result?.error) {
        setError(result.error);
      } else {
        // Data deleted — sign out and redirect
        await signOut({ callbackUrl: '/login' });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <Trash2 className="w-3.5 h-3.5" />
          Delete account
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete your account</DialogTitle>
          <DialogDescription>
            This permanently deletes your profile, all triage sessions, and all commitments.
            This action <strong>cannot be undone</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_WORD}
            disabled={pending}
            className="font-mono"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={!ready || pending}
          >
            {pending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Deleting…</>
              : 'Permanently delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

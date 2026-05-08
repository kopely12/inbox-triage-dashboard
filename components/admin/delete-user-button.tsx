'use client';

import { useState, useTransition } from 'react';
import { deleteUser } from '@/app/actions/admin';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen]       = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteUser(userId);
        toast.success(`${email} deleted`);
        setOpen(false);
      } catch {
        toast.error('Failed to delete user');
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Delete user"
        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{email}</strong> and all their data. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete user'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { saveAdminNote } from '@/app/actions/admin';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NotebookPen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NoteCell({ userId, note }: { userId: string; note: string | null }) {
  const [open, setOpen]       = useState(false);
  const [value, setValue]     = useState(note ?? '');
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await saveAdminNote(userId, value);
        toast.success('Note saved');
        setOpen(false);
      } catch {
        toast.error('Failed to save note');
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setValue(note ?? ''); setOpen(true); }}
        title={note ? note : 'Add note'}
        className={cn(
          'flex items-center gap-1.5 text-xs transition-colors max-w-[160px]',
          note
            ? 'text-foreground hover:text-primary'
            : 'text-muted-foreground/50 hover:text-muted-foreground',
        )}
      >
        <NotebookPen className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{note || 'Add note'}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Admin note</DialogTitle>
          </DialogHeader>

          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Internal notes about this user…"
            rows={4}
            disabled={pending}
            className="resize-none text-sm"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save note'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

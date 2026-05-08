'use client';

import { useState, useTransition } from 'react';
import { Gift, Loader2 }           from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { compUser, removeComp } from '@/app/actions/admin';
import { toast } from 'sonner';

type Props = {
  userId:      string;
  userName:    string;
  compedUntil: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function CompButton({ userId, userName, compedUntil }: Props) {
  const [open, setOpen]            = useState(false);
  const [date, setDate]            = useState('');
  const [pending, startTransition] = useTransition();

  const isActiveComp = !!compedUntil && new Date(compedUntil) > new Date();

  // Min date input value = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);

  function handleGive() {
    if (!date) return;
    startTransition(async () => {
      const result = await compUser(userId, date);
      if (result.ok) {
        toast.success(`${userName} now has Pro access until ${fmtDate(date)}.`);
        setOpen(false);
        setDate('');
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeComp(userId);
      if (result.ok) {
        toast.success(`Comp removed — ${userName} is now on the free plan.`);
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={isActiveComp ? `Comped until ${fmtDate(compedUntil!)}` : 'Give comped Pro access'}
        className={`p-1.5 rounded-md transition-colors ${
          isActiveComp
            ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`}
      >
        <Gift className="w-3.5 h-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Comped Pro access</DialogTitle>
            <DialogDescription>
              Give <strong>{userName}</strong> free Pro access until a specific date.
              No Stripe subscription is created — this is a manual override only.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isActiveComp && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                Currently comped until <strong>{fmtDate(compedUntil!)}</strong>.
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="comp-date">Pro access until</Label>
              <Input
                id="comp-date"
                type="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleGive} disabled={!date || pending}>
                {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isActiveComp ? 'Update comp date' : 'Give Pro access'}
              </Button>

              {isActiveComp && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemove}
                  disabled={pending}
                >
                  Remove comp — revert to free
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

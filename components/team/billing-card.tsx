'use client';

import { useState, useTransition } from 'react';
import { updateBillingEmail } from '@/app/actions/org-billing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CreditCard, Pencil, Check, X, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  orgId:              string;
  seatCount:          number;
  activeMemberCount:  number;
  billingEmail:       string | null;
  subscriptionStatus: string;
  currentPeriodEnd:   string | null;
  billingProvider:    string;
  isOwner:            boolean;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'text-emerald-600 border-emerald-300 bg-emerald-50',
    trialing: 'text-blue-600 border-blue-300 bg-blue-50',
    past_due: 'text-amber-600 border-amber-300 bg-amber-50',
    canceled: 'text-red-600 border-red-300 bg-red-50',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] capitalize', map[status] ?? 'text-muted-foreground')}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

export function BillingCard({
  orgId, seatCount, activeMemberCount, billingEmail,
  subscriptionStatus, currentPeriodEnd, billingProvider, isOwner,
}: Props) {
  const [editing, setEditing]      = useState(false);
  const [email, setEmail]          = useState(billingEmail ?? '');
  const [pending, startTransition] = useTransition();

  const seatsRemaining = Math.max(0, seatCount - activeMemberCount);
  const seatPct        = seatCount > 0 ? Math.min(1, activeMemberCount / seatCount) : 0;

  function handleSaveEmail() {
    startTransition(async () => {
      const result = await updateBillingEmail(orgId, email);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Billing email updated');
        setEditing(false);
      }
    });
  }

  function handleManageBilling() {
    toast.info('Stripe billing portal coming soon', {
      description: "Once Stripe is connected, you'll be able to update payment methods and download invoices here.",
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">

        {/* Status + period */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusBadge status={subscriptionStatus} />
            <span className="text-xs text-muted-foreground capitalize">{billingProvider} billing</span>
          </div>
          {currentPeriodEnd && (
            <span className="text-xs text-muted-foreground">
              Renews {fmtDate(currentPeriodEnd)}
            </span>
          )}
        </div>

        {/* Seat usage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              Seats used
            </span>
            <span className="font-medium">
              {activeMemberCount} / {seatCount}
              <span className="text-muted-foreground font-normal ml-1">
                ({seatsRemaining} remaining)
              </span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                seatPct >= 1 ? 'bg-red-500' : seatPct >= 0.8 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${seatPct * 100}%` }}
            />
          </div>
        </div>

        {/* Billing email */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Billing contact</p>
          {editing ? (
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEmail(); if (e.key === 'Escape') setEditing(false); }}
                placeholder="billing@company.com"
                className="h-8 text-xs"
                disabled={pending}
                autoFocus
              />
              <button onClick={handleSaveEmail} disabled={pending} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setEditing(false); setEmail(billingEmail ?? ''); }} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm">{billingEmail || <span className="text-muted-foreground italic">Not set</span>}</span>
              {isOwner && (
                <button onClick={() => setEditing(true)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Manage billing CTA */}
        {isOwner && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleManageBilling}>
            Manage billing
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

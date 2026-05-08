'use client';

import { useState, useTransition } from 'react';
import { saveOrgBilling, transferOrgOwnership, type OrgBillingFields } from '@/app/actions/org-billing';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { OrgMemberInfo } from '@/components/admin/orgs-panel';

type Props = {
  open:     boolean;
  onClose:  () => void;
  orgId:    string;
  orgName:  string;
  members:  OrgMemberInfo[];
  initial:  {
    billingEmail:        string;
    billingProvider:     string;
    subscriptionStatus:  string;
    currentPeriodEnd:    string;
    seatCount:           number;
    stripeCustomerId:    string;
    stripeSubscriptionId: string;
    customNotes:         string;
  };
};

const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'canceled'] as const;
const PROVIDER_OPTIONS = ['stripe', 'manual'] as const;

export function OrgBillingModal({ open, onClose, orgId, orgName, members, initial }: Props) {
  const [fields, setFields]        = useState(initial);
  const [pending, startTransition] = useTransition();
  const [xferTarget, setXferTarget] = useState('');

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const payload: OrgBillingFields = {
          billing_email:           fields.billingEmail.trim() || null,
          billing_provider:        fields.billingProvider,
          subscription_status:     fields.subscriptionStatus,
          current_period_end:      fields.currentPeriodEnd || null,
          seat_count:              Number(fields.seatCount),
          stripe_customer_id:      fields.stripeCustomerId.trim() || null,
          stripe_subscription_id:  fields.stripeSubscriptionId.trim() || null,
          custom_notes:            fields.customNotes.trim() || null,
        };
        await saveOrgBilling(orgId, payload);
        toast.success('Billing saved');
        onClose();
      } catch {
        toast.error('Failed to save billing');
      }
    });
  }

  function handleTransfer() {
    if (!xferTarget) return;
    startTransition(async () => {
      try {
        await transferOrgOwnership(orgId, xferTarget);
        toast.success('Ownership transferred');
        onClose();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
      }
    });
  }

  const isStripe  = fields.billingProvider === 'stripe';
  const nonOwners = members.filter((m) => !m.isOwner);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Billing — {orgName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">

          {/* Provider */}
          <div className="space-y-1.5">
            <Label>Payment provider</Label>
            <div className="flex gap-2">
              {PROVIDER_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => set('billingProvider', p)}
                  className={`px-4 py-1.5 rounded-md border text-sm font-medium capitalize transition-colors ${
                    fields.billingProvider === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Billing email */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-email">Billing email</Label>
            <Input
              id="billing-email"
              type="email"
              placeholder="billing@company.com"
              value={fields.billingEmail}
              onChange={(e) => set('billingEmail', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Subscription status */}
            <div className="space-y-1.5">
              <Label>Subscription status</Label>
              <select
                value={fields.subscriptionStatus}
                onChange={(e) => set('subscriptionStatus', e.target.value)}
                disabled={isStripe && pending}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
              {isStripe && (
                <p className="text-[11px] text-muted-foreground">Updated automatically via Stripe webhook.</p>
              )}
            </div>

            {/* Seat count */}
            <div className="space-y-1.5">
              <Label htmlFor="seat-count">Seats</Label>
              <Input
                id="seat-count"
                type="number"
                min={1}
                value={fields.seatCount}
                onChange={(e) => set('seatCount', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Period end */}
          <div className="space-y-1.5">
            <Label htmlFor="period-end">
              {isStripe ? 'Current period end' : 'Contract end date'}
            </Label>
            <Input
              id="period-end"
              type="date"
              value={fields.currentPeriodEnd?.slice(0, 10) ?? ''}
              onChange={(e) => set('currentPeriodEnd', e.target.value ? `${e.target.value}T00:00:00Z` : '')}
            />
            {!isStripe && (
              <p className="text-[11px] text-muted-foreground">Leave blank for perpetual / open-ended contracts.</p>
            )}
          </div>

          {/* Stripe IDs */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="stripe-cus">Stripe customer ID</Label>
              <div className="flex gap-2">
                <Input
                  id="stripe-cus"
                  placeholder="cus_…"
                  value={fields.stripeCustomerId}
                  onChange={(e) => set('stripeCustomerId', e.target.value)}
                  className="font-mono text-xs"
                />
                {fields.stripeCustomerId && (
                  <a
                    href={`https://dashboard.stripe.com/customers/${fields.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-2.5 rounded-md border border-input text-muted-foreground hover:text-[#635bff] transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stripe-sub">Stripe subscription ID</Label>
              <div className="flex gap-2">
                <Input
                  id="stripe-sub"
                  placeholder="sub_…"
                  value={fields.stripeSubscriptionId}
                  onChange={(e) => set('stripeSubscriptionId', e.target.value)}
                  className="font-mono text-xs"
                />
                {fields.stripeSubscriptionId && (
                  <a
                    href={`https://dashboard.stripe.com/subscriptions/${fields.stripeSubscriptionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-2.5 rounded-md border border-input text-muted-foreground hover:text-[#635bff] transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Custom notes */}
          <div className="space-y-1.5">
            <Label htmlFor="custom-notes">Internal notes</Label>
            <Textarea
              id="custom-notes"
              placeholder="Enterprise contract, net 60, $18k ARR…"
              rows={3}
              value={fields.customNotes}
              onChange={(e) => set('customNotes', e.target.value)}
              className="resize-none text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : 'Save billing'}
            </Button>
          </div>

          {/* Transfer ownership */}
          {nonOwners.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground">Transfer ownership</p>
              <div className="flex gap-2">
                <select
                  value={xferTarget}
                  onChange={(e) => setXferTarget(e.target.value)}
                  disabled={pending}
                  className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select new owner…</option>
                  {nonOwners.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleTransfer}
                  disabled={pending || !xferTarget}
                >
                  Transfer
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The current owner becomes an admin. This cannot be undone without another transfer.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

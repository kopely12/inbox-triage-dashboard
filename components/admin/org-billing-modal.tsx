'use client';

import { useState, useTransition } from 'react';
import { saveOrgBilling, type OrgBillingFields } from '@/app/actions/org-billing';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink, Loader2 } from 'lucide-react';

type Props = {
  open:    boolean;
  onClose: () => void;
  orgId:   string;
  orgName: string;
  initial: {
    billingEmail:         string;
    billingProvider:      string;
    billingCycle:         string;
    subscriptionStatus:   string;
    currentPeriodEnd:     string;
    seatCount:            number;
    billingAmount:        string;
    stripeCustomerId:     string;
    stripeSubscriptionId: string;
    customNotes:          string;
  };
};

const STATUS_OPTIONS   = ['active', 'trialing', 'past_due', 'canceled'] as const;
const PROVIDER_OPTIONS = ['stripe', 'manual']  as const;
const CYCLE_OPTIONS    = ['monthly', 'annual'] as const;

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options:  readonly string[];
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-md border text-sm font-medium capitalize transition-colors ${
            value === opt
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-input text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function OrgBillingModal({ open, onClose, orgId, orgName, initial }: Props) {
  const [fields, setFields]        = useState(initial);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const payload: OrgBillingFields = {
          billing_email:           fields.billingEmail.trim() || null,
          billing_provider:        fields.billingProvider,
          billing_cycle:           fields.billingCycle,
          subscription_status:     fields.subscriptionStatus,
          current_period_end:      fields.currentPeriodEnd || null,
          seat_count:              Number(fields.seatCount),
          billing_amount:          fields.billingAmount !== '' ? Number(fields.billingAmount) : null,
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

  const isStripe = fields.billingProvider === 'stripe';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Billing — {orgName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">

          {/* Provider + cycle */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment provider</Label>
              <ToggleGroup
                options={PROVIDER_OPTIONS}
                value={fields.billingProvider}
                onChange={(v) => set('billingProvider', v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing cycle</Label>
              <ToggleGroup
                options={CYCLE_OPTIONS}
                value={fields.billingCycle}
                onChange={(v) => set('billingCycle', v)}
              />
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

          <div className="grid grid-cols-3 gap-3">
            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={fields.subscriptionStatus}
                onChange={(e) => set('subscriptionStatus', e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              {isStripe && (
                <p className="text-[11px] text-muted-foreground">Auto-updated via webhook.</p>
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

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">
                {fields.billingCycle === 'annual' ? '$/yr (total)' : '$/mo'}
              </Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step={0.01}
                placeholder={fields.billingCycle === 'annual' ? '3480.00' : '290.00'}
                value={fields.billingAmount}
                onChange={(e) => set('billingAmount', e.target.value)}
              />
              {fields.billingCycle === 'annual' && fields.billingAmount !== '' && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ ${(Number(fields.billingAmount) / 12).toFixed(2)}/mo equivalent
                </p>
              )}
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
              <p className="text-[11px] text-muted-foreground">Leave blank for open-ended contracts.</p>
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

          {/* Notes */}
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
              {pending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                : 'Save billing'
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

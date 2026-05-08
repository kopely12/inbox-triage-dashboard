'use client';

import { useState, useTransition } from 'react';
import { createOrg } from '@/app/actions/org-billing';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { UserRow } from '@/components/admin/users-panel';

const PROVIDER_OPTIONS = ['stripe', 'manual'] as const;
const CYCLE_OPTIONS    = ['monthly', 'annual']  as const;

const DEFAULTS = {
  name:            '',
  ownerId:         '',
  seatCount:       5,
  billingEmail:    '',
  billingProvider: 'stripe'   as string,
  billingCycle:    'monthly'  as string,
  billingAmount:   '',
};

function ToggleGroup({
  options,
  value,
  onChange,
  disabled,
}: {
  options:  readonly string[];
  value:    string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          disabled={disabled}
          className={`px-4 py-1.5 rounded-md border text-sm font-medium capitalize transition-colors disabled:opacity-50 ${
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

export function CreateOrgModal({
  open,
  onClose,
  eligibleOwners,
}: {
  open:           boolean;
  onClose:        () => void;
  eligibleOwners: UserRow[];
}) {
  const [fields, setFields]        = useState(DEFAULTS);
  const [error,  setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  function handleClose() {
    setFields(DEFAULTS);
    setError(null);
    onClose();
  }

  function handleCreate() {
    if (!fields.name.trim()) { setError('Organization name is required.'); return; }
    if (!fields.ownerId)     { setError('Please select an owner.'); return; }

    startTransition(async () => {
      try {
        await createOrg({
          name:            fields.name,
          ownerId:         fields.ownerId,
          seatCount:       Number(fields.seatCount),
          billingEmail:    fields.billingEmail,
          billingProvider: fields.billingProvider,
          billingCycle:    fields.billingCycle,
          billingAmount:   fields.billingAmount !== '' ? Number(fields.billingAmount) : null,
        });
        toast.success(`"${fields.name.trim()}" created`);
        handleClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create organization');
      }
    });
  }

  const amountLabel = fields.billingCycle === 'annual' ? '$/yr (total)' : '$/mo';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>
            Create an org and assign an owner. Additional members can be added from the Organizations tab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">

          {/* Org name */}
          <div className="space-y-1.5">
            <Label htmlFor="org-name">
              Organization name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="org-name"
              placeholder="Acme Corp"
              value={fields.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={pending}
            />
          </div>

          {/* Owner */}
          <div className="space-y-1.5">
            <Label htmlFor="owner">Owner <span className="text-destructive">*</span></Label>
            {eligibleOwners.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">
                No eligible users — all existing users are already in an organization.
              </p>
            ) : (
              <select
                id="owner"
                value={fields.ownerId}
                onChange={(e) => set('ownerId', e.target.value)}
                disabled={pending}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Select owner…</option>
                {eligibleOwners.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.email}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Seats */}
          <div className="space-y-1.5">
            <Label htmlFor="seat-count">Seats</Label>
            <Input
              id="seat-count"
              type="number"
              min={1}
              value={fields.seatCount}
              onChange={(e) => set('seatCount', Number(e.target.value))}
              disabled={pending}
            />
          </div>

          {/* Billing cycle + amount */}
          <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
            <div className="space-y-1.5">
              <Label>Billing cycle</Label>
              <ToggleGroup
                options={CYCLE_OPTIONS}
                value={fields.billingCycle}
                onChange={(v) => set('billingCycle', v)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">{amountLabel}</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step={0.01}
                placeholder={fields.billingCycle === 'annual' ? '3480.00' : '290.00'}
                value={fields.billingAmount}
                onChange={(e) => set('billingAmount', e.target.value)}
                disabled={pending}
              />
              {fields.billingCycle === 'annual' && fields.billingAmount !== '' && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ ${(Number(fields.billingAmount) / 12).toFixed(2)}/mo equivalent
                </p>
              )}
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
              disabled={pending}
            />
          </div>

          {/* Payment provider */}
          <div className="space-y-1.5">
            <Label>Payment provider</Label>
            <ToggleGroup
              options={PROVIDER_OPTIONS}
              value={fields.billingProvider}
              onChange={(v) => set('billingProvider', v)}
              disabled={pending}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" onClick={handleClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={pending || eligibleOwners.length === 0}>
              {pending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</>
                : 'Create organization'
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

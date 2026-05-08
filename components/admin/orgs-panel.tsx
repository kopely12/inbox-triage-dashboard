'use client';

import { useState, useTransition } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminChangeOrgRole, adminRemoveFromOrg, adminAddToOrg } from '@/app/actions/admin';
import { OrgBillingModal } from '@/components/admin/org-billing-modal';
import { toast } from 'sonner';
import {
  ChevronDown, ChevronRight, Loader2, UserMinus, UserPlus,
  Building2, Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── types ────────────────────────────────────────────────────────────────────

export type OrgMemberInfo = {
  memberId: string;
  userId:   string;
  email:    string;
  name:     string;
  initials: string;
  role:     string;
  isOwner:  boolean;
};

export type OrgRow = {
  id:                   string;
  name:                 string;
  createdAt:            string;
  memberCount:          number;
  members:              OrgMemberInfo[];
  // billing
  billingProvider:      string;
  billingEmail:         string | null;
  subscriptionStatus:   string;
  currentPeriodEnd:     string | null;
  seatCount:            number;
  billingAmount:        number | null;
  stripeCustomerId:     string | null;
  stripeSubscriptionId: string | null;
  customNotes:          string | null;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'text-emerald-600 border-emerald-300 bg-emerald-50',
    trialing:  'text-blue-600 border-blue-300 bg-blue-50',
    past_due:  'text-amber-600 border-amber-300 bg-amber-50',
    canceled:  'text-red-600 border-red-300 bg-red-50',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] capitalize', map[status] ?? 'text-muted-foreground')}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── member row ───────────────────────────────────────────────────────────────

function MemberRow({ member, orgId }: { member: OrgMemberInfo; orgId: string }) {
  const [pending, startTransition] = useTransition();

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as 'admin' | 'member';
    startTransition(async () => {
      try {
        await adminChangeOrgRole(member.memberId, role);
        toast.success(`${member.email} is now ${role}`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to change role');
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await adminRemoveFromOrg(member.memberId);
        toast.success(`${member.email} removed from org`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove member');
      }
    });
  }

  return (
    <div className={cn('flex items-center gap-3 py-2 px-3 rounded-md', pending && 'opacity-50')}>
      <Avatar className="w-6 h-6 shrink-0">
        <AvatarFallback className="text-[10px]">{member.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{member.name}</p>
        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
      </div>

      {member.isOwner ? (
        <Badge variant="secondary" className="text-[10px] capitalize shrink-0">Owner</Badge>
      ) : (
        <select
          defaultValue={member.role}
          onChange={handleRoleChange}
          disabled={pending}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 capitalize shrink-0"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      )}

      {!member.isOwner && (
        <button
          onClick={handleRemove}
          disabled={pending}
          title="Remove from org"
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ─── add member form ──────────────────────────────────────────────────────────

function AddMemberForm({ orgId }: { orgId: string }) {
  const [email, setEmail]          = useState('');
  const [role, setRole]            = useState<'admin' | 'member'>('member');
  const [error, setError]          = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await adminAddToOrg(orgId, email, role);
      if (result?.error) {
        setError(result.error);
      } else {
        toast.success(`${email} added to org`);
        setEmail('');
      }
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Add existing user</p>
      <div className="flex gap-2">
        <Input
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          disabled={pending}
          className="h-8 text-xs flex-1"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
          disabled={pending}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <Button size="sm" className="h-8 gap-1.5" onClick={handleAdd} disabled={pending || !email.trim()}>
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── org card ─────────────────────────────────────────────────────────────────

function OrgCard({ org }: { org: OrgRow }) {
  const [expanded,     setExpanded]     = useState(false);
  const [billingOpen,  setBillingOpen]  = useState(false);

  const seatsUsed = org.memberCount;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 flex-1 text-left min-w-0"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{org.name}</p>
            <p className="text-xs text-muted-foreground">
              {seatsUsed} / {org.seatCount} seat{org.seatCount !== 1 ? 's' : ''}
              &nbsp;·&nbsp;Created {fmtDate(org.createdAt)}
              {org.currentPeriodEnd && (
                <>&nbsp;·&nbsp;Renews {fmtDate(org.currentPeriodEnd)}</>
              )}
            </p>
          </div>
        </button>

        {/* Badges + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={org.subscriptionStatus} />
          <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground">
            {org.billingProvider}
          </Badge>
          <button
            onClick={() => setBillingOpen(true)}
            title="Edit billing"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 text-muted-foreground"
          >
            {expanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      {/* Expanded: billing summary + members */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Billing summary strip */}
          {(org.billingEmail || org.customNotes) && (
            <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/40 rounded-md px-3 py-2">
              {org.billingEmail && <p>Billing contact: <span className="text-foreground">{org.billingEmail}</span></p>}
              {org.customNotes  && <p>Notes: <span className="text-foreground">{org.customNotes}</span></p>}
            </div>
          )}

          {/* Members */}
          <div className="divide-y divide-border">
            {org.members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No members yet.</p>
            ) : (
              org.members.map((m) => (
                <MemberRow key={m.memberId} member={m} orgId={org.id} />
              ))
            )}
          </div>

          <AddMemberForm orgId={org.id} />
        </div>
      )}

      {/* Billing modal */}
      <OrgBillingModal
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        orgId={org.id}
        orgName={org.name}
        initial={{
          billingEmail:         org.billingEmail         ?? '',
          billingProvider:      org.billingProvider      ?? 'stripe',
          subscriptionStatus:   org.subscriptionStatus   ?? 'active',
          currentPeriodEnd:     org.currentPeriodEnd     ?? '',
          seatCount:            org.seatCount            ?? 5,
          billingAmount:        org.billingAmount != null ? String(org.billingAmount) : '',
          stripeCustomerId:     org.stripeCustomerId     ?? '',
          stripeSubscriptionId: org.stripeSubscriptionId ?? '',
          customNotes:          org.customNotes          ?? '',
        }}
      />
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

export function OrgsPanel({ orgs }: { orgs: OrgRow[] }) {
  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <Building2 className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No organizations yet.</p>
        <p className="text-xs text-muted-foreground">
          Organizations are created when team owners first visit the Team page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orgs.map((org) => (
        <OrgCard key={org.id} org={org} />
      ))}
    </div>
  );
}

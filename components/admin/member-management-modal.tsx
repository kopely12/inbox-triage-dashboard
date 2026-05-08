'use client';

import { useState, useTransition } from 'react';
import { adminChangeOrgRole, adminRemoveFromOrg, adminAddToOrg } from '@/app/actions/admin';
import { transferOrgOwnership } from '@/app/actions/org-billing';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, UserMinus, UserPlus, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgMemberInfo } from '@/components/admin/orgs-panel';

// ─── member row ───────────────────────────────────────────────────────────────

function MemberRow({ member }: { member: OrgMemberInfo }) {
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
        toast.success(`${member.email} removed`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove member');
      }
    });
  }

  return (
    <div className={cn('flex items-center gap-3 py-2.5', pending && 'opacity-50')}>
      <Avatar className="w-7 h-7 shrink-0">
        <AvatarFallback className="text-xs">{member.initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate leading-tight">{member.name}</p>
        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
      </div>

      {member.isOwner ? (
        <Badge variant="secondary" className="text-[10px] shrink-0">Owner</Badge>
      ) : (
        <select
          defaultValue={member.role}
          onChange={handleRoleChange}
          disabled={pending}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 shrink-0"
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
          {pending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <UserMinus className="w-3.5 h-3.5" />
          }
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
      const result = await adminAddToOrg(orgId, email.trim(), role);
      if (result?.error) {
        setError(result.error);
      } else {
        toast.success(`${email.trim()} added`);
        setEmail('');
      }
    });
  }

  return (
    <div className="space-y-2 pt-4 border-t border-border">
      <Label className="text-xs font-medium text-muted-foreground">Add existing user</Label>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          disabled={pending}
          className={cn('h-8 text-xs flex-1', error && 'border-destructive focus-visible:ring-destructive')}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
          disabled={pending}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 shrink-0"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <Button
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          onClick={handleAdd}
          disabled={pending || !email.trim()}
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          Add
        </Button>
      </div>

      {/* Inline error — especially useful for "already in another org" */}
      {error && (
        <p className="text-xs text-destructive flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5">⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── transfer ownership ───────────────────────────────────────────────────────

function TransferOwnershipSection({ orgId, members, onClose }: {
  orgId:   string;
  members: OrgMemberInfo[];
  onClose: () => void;
}) {
  const [target, setTarget]        = useState('');
  const [pending, startTransition] = useTransition();
  const nonOwners                  = members.filter((m) => !m.isOwner);

  if (nonOwners.length === 0) return null;

  function handleTransfer() {
    if (!target) return;
    startTransition(async () => {
      try {
        await transferOrgOwnership(orgId, target);
        toast.success('Ownership transferred');
        onClose();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
      }
    });
  }

  return (
    <div className="space-y-2 pt-4 border-t border-border">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        <Label className="text-xs font-medium text-muted-foreground">Transfer ownership</Label>
      </div>
      <div className="flex gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
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
          className="h-8 text-xs shrink-0"
          onClick={handleTransfer}
          disabled={pending || !target}
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Transfer'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Current owner becomes an admin. Cannot be undone without another transfer.
      </p>
    </div>
  );
}

// ─── main modal ───────────────────────────────────────────────────────────────

export function MemberManagementModal({ open, onClose, orgId, orgName, members }: {
  open:    boolean;
  onClose: () => void;
  orgId:   string;
  orgName: string;
  members: OrgMemberInfo[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Members — {orgName}</DialogTitle>
        </DialogHeader>

        <div className="pt-1">
          {/* Member list */}
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((m) => (
                <MemberRow key={m.memberId} member={m} />
              ))}
            </div>
          )}

          <AddMemberForm orgId={orgId} />
          <TransferOwnershipSection orgId={orgId} members={members} onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

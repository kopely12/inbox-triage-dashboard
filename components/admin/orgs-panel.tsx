'use client';

import { useState, useTransition } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminChangeOrgRole, adminRemoveFromOrg, adminAddToOrg } from '@/app/actions/admin';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, UserMinus, UserPlus, Building2 } from 'lucide-react';
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
  id:          string;
  name:        string;
  createdAt:   string;
  memberCount: number;
  members:     OrgMemberInfo[];
};

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
  const [email, setEmail]   = useState('');
  const [role, setRole]     = useState<'admin' | 'member'>('member');
  const [error, setError]   = useState<string | null>(null);
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
  const [expanded, setExpanded] = useState(false);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
          <Building2 className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{org.name}</p>
          <p className="text-xs text-muted-foreground">
            {org.memberCount} member{org.memberCount !== 1 ? 's' : ''} · Created {fmtDate(org.createdAt)}
          </p>
        </div>

        {expanded
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded members */}
      {expanded && (
        <div className="px-4 pb-4">
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
    </div>
  );
}

// ─── main panel ──────────────────────────────────────────────────────────────

export function OrgsPanel({ orgs }: { orgs: OrgRow[] }) {
  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <Building2 className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No organizations yet.</p>
        <p className="text-xs text-muted-foreground">Organizations are created when team owners first visit the Team page.</p>
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

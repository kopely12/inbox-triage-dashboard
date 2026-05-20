'use client';

import { useTransition, useState } from 'react';
import { changeRole, removeMember, revokeInvite, transferOwnership } from '@/app/actions/team';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Crown, Loader2, Copy, Check, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  users: { name: string | null; email: string; avatar_url: string | null } | null;
};

type Invite = {
  id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  expires_at: string;
  token: string;
};

const ROLE_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner:  'default',
  admin:  'secondary',
  member: 'outline',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Transfer ownership dialog ─────────────────────────────────────────────────

function TransferDialog({
  open, memberName, memberId, onClose,
}: {
  open: boolean; memberName: string; memberId: string; onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await transferOwnership(memberId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Ownership transferred to ${memberName}. You are now an admin.`);
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer ownership to {memberName}?</DialogTitle>
          <DialogDescription>
            {memberName} will become the organization owner with full billing and admin control.
            You will be downgraded to admin. <strong>This cannot be undone.</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Transferring…</>
              : <><Crown className="w-3.5 h-3.5 mr-1.5" />Transfer ownership</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({ member, currentUserId, isAdmin, viewerIsOwner }: {
  member: Member;
  currentUserId: string;
  isAdmin: boolean;
  viewerIsOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [transferOpen, setTransferOpen] = useState(false);

  const isSelf        = member.user_id === currentUserId;
  const memberIsOwner = member.role === 'owner';
  const canEdit       = isAdmin && !isSelf && !memberIsOwner;
  const canTransfer   = viewerIsOwner && !isSelf && !memberIsOwner;

  const name     = member.users?.name ?? member.users?.email ?? '—';
  const email    = member.users?.email ?? '—';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <div className="flex items-center gap-3 py-3">
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarImage src={member.users?.avatar_url ?? ''} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {name}
            {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>

        <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
          {fmtDate(member.joined_at)}
        </span>

        {canEdit ? (
          <select
            defaultValue={member.role}
            disabled={pending}
            onChange={(e) => startTransition(() => {
              changeRole(member.id, e.target.value as 'admin' | 'member');
            })}
            className="h-7 text-xs rounded-md border border-input bg-background px-2 shrink-0"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        ) : (
          <Badge variant={ROLE_COLORS[member.role]} className="capitalize text-xs shrink-0">
            {member.role}
          </Badge>
        )}

        {canTransfer && (
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0 text-muted-foreground hover:text-amber-600"
            title={`Transfer ownership to ${name}`}
            onClick={() => setTransferOpen(true)}
          >
            <Crown className="w-3.5 h-3.5" />
          </Button>
        )}

        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={pending}
            title={`Remove ${name}`}
            onClick={() => startTransition(() => { removeMember(member.id); })}
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>

      <TransferDialog
        open={transferOpen}
        memberName={name}
        memberId={member.id}
        onClose={() => setTransferOpen(false)}
      />
    </>
  );
}

// ── Invite row ────────────────────────────────────────────────────────────────

function InviteRow({ invite, baseUrl }: { invite: Invite; baseUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${baseUrl}/invite/${invite.token}`;

  const expiresAt   = new Date(invite.expires_at);
  const hoursLeft   = (expiresAt.getTime() - Date.now()) / 3_600_000;
  const expiringSoon = hoursLeft < 48; // highlight if < 2 days remaining
  const expiresLabel = fmtDate(invite.expires_at);

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 py-3 opacity-80">
      <div className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <span className="text-xs text-muted-foreground">?</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{invite.email}</p>
        <p className={cn(
          'text-xs mt-0.5',
          expiringSoon ? 'text-amber-600 font-medium' : 'text-muted-foreground',
        )}>
          {expiringSoon ? '⚠ ' : ''}Link expires {expiresLabel}
        </p>
      </div>

      <Badge variant="outline" className="text-xs shrink-0">Pending</Badge>

      {/* Copy button — tooltip explicitly states the expiry so users know before sharing */}
      <Button
        variant="ghost"
        size="icon"
        className="w-7 h-7 shrink-0"
        onClick={copy}
        title={`Copy invite link (expires ${expiresLabel})`}
      >
        {copied
          ? <Check className="w-3.5 h-3.5 text-green-600" />
          : <Copy className="w-3.5 h-3.5" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
        disabled={pending}
        title="Revoke invite"
        onClick={() => startTransition(() => { revokeInvite(invite.id); })}
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function MembersTable({
  members,
  invites,
  currentUserId,
  isAdmin,
  viewerIsOwner,
  baseUrl,
}: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  isAdmin: boolean;
  viewerIsOwner: boolean;
  baseUrl: string;
}) {
  const [query, setQuery] = useState('');

  const q = query.toLowerCase().trim();
  const filteredMembers = members.filter((m) => {
    if (!q) return true;
    return (m.users?.name ?? '').toLowerCase().includes(q)
        || (m.users?.email ?? '').toLowerCase().includes(q);
  });
  const filteredInvites = invites.filter((inv) =>
    !q || inv.email.toLowerCase().includes(q),
  );

  const totalRows = members.length + invites.length;
  const hasRows   = totalRows > 0;
  const showSearch = totalRows >= 8; // search is useful once the list grows

  if (!hasRows) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>;
  }

  return (
    <div className="space-y-0">
      {showSearch && (
        <div className="pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {filteredMembers.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            viewerIsOwner={viewerIsOwner}
          />
        ))}
        {filteredInvites.map((inv) => (
          <InviteRow key={inv.id} invite={inv} baseUrl={baseUrl} />
        ))}
        {q && filteredMembers.length === 0 && filteredInvites.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No results for &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

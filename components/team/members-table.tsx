'use client';

import { useTransition } from 'react';
import { changeRole, removeMember, revokeInvite } from '@/app/actions/team';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, X } from 'lucide-react';
import { useState } from 'react';

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

function MemberRow({ member, currentUserId, isAdmin }: {
  member: Member;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const isSelf   = member.user_id === currentUserId;
  const isOwner  = member.role === 'owner';
  const canEdit  = isAdmin && !isSelf && !isOwner;

  const name     = member.users?.name ?? member.users?.email ?? '—';
  const email    = member.users?.email ?? '—';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const joined   = new Date(member.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex items-center gap-3 py-3">
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarImage src={member.users?.avatar_url ?? ''} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}{isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}</p>
        <p className="text-xs text-muted-foreground truncate">{email}</p>
      </div>

      <span className="text-xs text-muted-foreground hidden sm:block shrink-0">{joined}</span>

      {canEdit ? (
        <select
          defaultValue={member.role}
          disabled={pending}
          onChange={(e) => startTransition(() => { changeRole(member.id, e.target.value as 'admin' | 'member'); })}
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

      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={pending}
          onClick={() => startTransition(() => { removeMember(member.id); })}
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </Button>
      )}
    </div>
  );
}

function InviteRow({ invite, baseUrl }: { invite: Invite; baseUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${baseUrl}/invite/${invite.token}`;

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const expires = new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center gap-3 py-3 opacity-70">
      <div className="w-8 h-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
        <span className="text-xs text-muted-foreground">?</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{invite.email}</p>
        <p className="text-xs text-muted-foreground">Invite expires {expires}</p>
      </div>

      <Badge variant="outline" className="text-xs shrink-0">Pending</Badge>

      <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0" onClick={copy} title="Copy invite link">
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
        disabled={pending}
        onClick={() => startTransition(() => { revokeInvite(invite.id); })}
        title="Revoke invite"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

export function MembersTable({ members, invites, currentUserId, isAdmin, baseUrl }: {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  isAdmin: boolean;
  baseUrl: string;
}) {
  const hasRows = members.length > 0 || invites.length > 0;

  if (!hasRows) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {members.map((m) => (
        <MemberRow key={m.id} member={m} currentUserId={currentUserId} isAdmin={isAdmin} />
      ))}
      {invites.map((inv) => (
        <InviteRow key={inv.id} invite={inv} baseUrl={baseUrl} />
      ))}
    </div>
  );
}

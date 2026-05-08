'use client';

import { useState, useTransition } from 'react';
import { Badge }      from '@/components/ui/badge';
import { Button }     from '@/components/ui/button';
import { Input }      from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Trash2, Loader2 } from 'lucide-react';
import { revokeInvite } from '@/app/actions/admin-invites';
import { toast }        from 'sonner';

// ─── types ────────────────────────────────────────────────────────────────────

export type InviteRow = {
  id:             string;
  orgId:          string;
  orgName:        string;
  email:          string;
  role:           string;
  invitedByEmail: string;
  createdAt:      string;
  expiresAt:      string;
  isExpired:      boolean;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── revoke button ────────────────────────────────────────────────────────────

function RevokeButton({ inviteId, onRevoked }: { inviteId: string; onRevoked: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (result.ok) {
        toast.success('Invite revoked.');
        onRevoked();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title="Revoke invite"
      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
    >
      {pending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Trash2  className="w-3.5 h-3.5" />
      }
    </button>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export function InvitesPanel({ rows: initialRows }: { rows: InviteRow[] }) {
  const [rows, setRows]     = useState(initialRows);
  const [search, setSearch] = useState('');

  function handleRevoked(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.trim().toLowerCase();
        return (
          r.email.toLowerCase().includes(q)    ||
          r.orgName.toLowerCase().includes(q)  ||
          r.invitedByEmail.toLowerCase().includes(q)
        );
      })
    : rows;

  const pendingCount = rows.filter((r) => !r.isExpired).length;
  const expiredCount = rows.filter((r) =>  r.isExpired).length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search email, org, or sender…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-1">
          {pendingCount} pending · {expiredCount} expired
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Invited email</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                  {search ? 'No invites match your search.' : 'No open invites.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id} className={row.isExpired ? 'opacity-60' : ''}>
                  <TableCell className="pl-5 text-sm font-medium">{row.email}</TableCell>

                  <TableCell className="text-sm text-muted-foreground">{row.orgName}</TableCell>

                  <TableCell className="text-sm text-muted-foreground capitalize">{row.role}</TableCell>

                  <TableCell className="text-sm text-muted-foreground">{row.invitedByEmail}</TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDate(row.createdAt)}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDate(row.expiresAt)}
                  </TableCell>

                  <TableCell>
                    {row.isExpired ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Expired</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">Pending</Badge>
                    )}
                  </TableCell>

                  <TableCell className="pr-5">
                    <RevokeButton inviteId={row.id} onRevoked={() => handleRevoked(row.id)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, ExternalLink, Search } from 'lucide-react';
import { PlanSelect }       from '@/components/admin/plan-select';
import { DeleteUserButton } from '@/components/admin/delete-user-button';
import { NoteCell }         from '@/components/admin/note-cell';
import { SuspendButton }    from '@/components/admin/suspend-button';

// ─── types ────────────────────────────────────────────────────────────────────

export type UserRow = {
  id:                 string;
  email:              string;
  name:               string;
  initials:           string;
  plan:               'free' | 'pro' | 'team';
  org_role:           string | null;
  created_at:         string;
  admin_notes:        string | null;
  suspended_at:       string | null;
  stripe_customer_id: string | null;
  triage:             { count: number; lastDate: string } | undefined;
  status:             'active' | 'inactive' | 'never';
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relDate(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return fmtDate(iso);
}

function exportCSV(rows: UserRow[]) {
  const headers = ['Name', 'Email', 'Plan', 'Role', 'Joined', 'Triages', 'Last Triage', 'Status', 'Suspended', 'Notes'];
  const lines = rows.map((r) => [
    `"${r.name.replace(/"/g, '""')}"`,
    `"${r.email}"`,
    r.plan,
    r.org_role ?? 'member',
    r.created_at.slice(0, 10),
    String(r.triage?.count ?? 0),
    r.triage?.lastDate.slice(0, 10) ?? '',
    r.status,
    r.suspended_at ? 'yes' : 'no',
    `"${(r.admin_notes ?? '').replace(/"/g, '""')}"`,
  ].join(','));

  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `users-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── component ────────────────────────────────────────────────────────────────

export function UsersPanel({ rows }: { rows: UserRow[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const domain = r.email.split('@')[1] ?? '';
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        domain.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name, email, or domain…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-1">
          {filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''} user{rows.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={() => exportCSV(filtered)}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 w-56">User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last triage</TableHead>
              <TableHead className="text-right">Triages</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="pr-5 w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                  {search ? 'No users match your search.' : 'No users yet.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarFallback className="text-xs">{row.initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                      </div>
                      {row.stripe_customer_id && (
                        <a
                          href={`https://dashboard.stripe.com/customers/${row.stripe_customer_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Stripe"
                          className="ml-auto shrink-0 p-1 rounded text-muted-foreground/50 hover:text-[#635bff] transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <PlanSelect userId={row.id} currentPlan={row.plan} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {row.org_role ?? 'member'}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDate(row.created_at)}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {row.triage ? relDate(row.triage.lastDate) : '—'}
                  </TableCell>

                  <TableCell className="text-right text-sm font-medium pr-3">
                    {row.triage?.count ?? 0}
                  </TableCell>

                  <TableCell>
                    {row.suspended_at ? (
                      <Badge variant="outline" className="text-xs text-red-600 border-red-300 bg-red-50">Suspended</Badge>
                    ) : row.status === 'active' ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50">Active</Badge>
                    ) : row.status === 'inactive' ? (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">Inactive</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Never triaged</Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    <NoteCell userId={row.id} note={row.admin_notes} />
                  </TableCell>

                  <TableCell className="pr-5">
                    <div className="flex items-center gap-0.5">
                      <SuspendButton
                        userId={row.id}
                        email={row.email}
                        suspendedAt={row.suspended_at}
                      />
                      <DeleteUserButton userId={row.id} email={row.email} />
                    </div>
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

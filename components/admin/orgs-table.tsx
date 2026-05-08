'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { OrgBillingModal }        from '@/components/admin/org-billing-modal';
import { MemberManagementModal }  from '@/components/admin/member-management-modal';
import { CreateOrgModal }         from '@/components/admin/create-org-modal';
import { Search, Users, Settings2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgRow } from '@/components/admin/orgs-panel';
import type { UserRow } from '@/components/admin/users-panel';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtAmount(amount: number | null) {
  if (amount === null) return '—';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/mo`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:   'text-emerald-600 border-emerald-300 bg-emerald-50',
    trialing: 'text-blue-600 border-blue-300 bg-blue-50',
    past_due: 'text-amber-600 border-amber-300 bg-amber-50',
    canceled: 'text-red-600 border-red-300 bg-red-50',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] capitalize whitespace-nowrap', styles[status] ?? 'text-muted-foreground')}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

// ─── row modals state ─────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'members'; org: OrgRow }
  | { kind: 'billing'; org: OrgRow };

// ─── component ────────────────────────────────────────────────────────────────

export function OrgsTable({ orgs, userRows }: { orgs: OrgRow[]; userRows: UserRow[] }) {
  const [search, setSearch]     = useState('');
  const [modal, setModal]       = useState<ModalState>({ kind: 'none' });

  // Users eligible to become org owners: not in an org, not suspended
  const eligibleOwners = userRows.filter((u) => !u.org_role && !u.suspended_at);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      (o.billingEmail ?? '').toLowerCase().includes(q),
    );
  }, [orgs, search]);

  function closeModal() { setModal({ kind: 'none' }); }

  return (
    <>
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or billing email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-1">
            {filtered.length}{filtered.length !== orgs.length ? ` of ${orgs.length}` : ''}{' '}
            org{orgs.length !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setModal({ kind: 'create' })}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New organization
          </button>
        </div>

        {/* Table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 w-56">Organization</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-5 w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                    {search ? 'No organizations match your search.' : 'No organizations yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((org) => (
                  <TableRow key={org.id}>
                    {/* Organization */}
                    <TableCell className="pl-5">
                      <p className="text-sm font-medium truncate max-w-[200px]">{org.name}</p>
                      {org.billingEmail && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{org.billingEmail}</p>
                      )}
                      {org.customNotes && (
                        <p className="text-[10px] text-muted-foreground/70 truncate max-w-[200px] italic">{org.customNotes}</p>
                      )}
                    </TableCell>

                    {/* Provider */}
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground">
                        {org.billingProvider}
                      </Badge>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <StatusBadge status={org.subscriptionStatus} />
                    </TableCell>

                    {/* Seats */}
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="font-medium">{org.memberCount}</span>
                      <span className="text-muted-foreground"> / {org.seatCount}</span>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {fmtAmount(org.billingAmount)}
                    </TableCell>

                    {/* Renewal */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {org.currentPeriodEnd ? fmtDate(org.currentPeriodEnd) : '—'}
                    </TableCell>

                    {/* Created */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {fmtDate(org.createdAt)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({ kind: 'members', org })}
                          title="Manage members"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setModal({ kind: 'billing', org })}
                          title="Edit billing"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create org modal */}
      {modal.kind === 'create' && (
        <CreateOrgModal
          open
          onClose={closeModal}
          eligibleOwners={eligibleOwners}
        />
      )}

      {/* Member management modal */}
      {modal.kind === 'members' && (
        <MemberManagementModal
          open
          onClose={closeModal}
          orgId={modal.org.id}
          orgName={modal.org.name}
          members={modal.org.members}
        />
      )}

      {/* Billing modal */}
      {modal.kind === 'billing' && (
        <OrgBillingModal
          open
          onClose={closeModal}
          orgId={modal.org.id}
          orgName={modal.org.name}
          initial={{
            billingEmail:         modal.org.billingEmail         ?? '',
            billingProvider:      modal.org.billingProvider      ?? 'stripe',
            subscriptionStatus:   modal.org.subscriptionStatus   ?? 'active',
            currentPeriodEnd:     modal.org.currentPeriodEnd     ?? '',
            seatCount:            modal.org.seatCount            ?? 5,
            billingAmount:        modal.org.billingAmount != null ? String(modal.org.billingAmount) : '',
            stripeCustomerId:     modal.org.stripeCustomerId     ?? '',
            stripeSubscriptionId: modal.org.stripeSubscriptionId ?? '',
            customNotes:          modal.org.customNotes          ?? '',
          }}
        />
      )}
    </>
  );
}

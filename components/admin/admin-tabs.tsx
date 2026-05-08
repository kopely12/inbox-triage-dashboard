'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { UsersPanel,  type UserRow }   from '@/components/admin/users-panel';
import { OrgsTable }                   from '@/components/admin/orgs-table';
import { type OrgRow }                 from '@/components/admin/orgs-panel';
import { InvitesPanel, type InviteRow } from '@/components/admin/invites-panel';
import { Users, Building2, Mail }      from 'lucide-react';

type Tab = 'users' | 'orgs' | 'invites';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'users',   label: 'Users',         icon: Users     },
  { id: 'orgs',    label: 'Organizations', icon: Building2 },
  { id: 'invites', label: 'Invites',       icon: Mail      },
];

export function AdminTabs({
  userRows,
  orgRows,
  inviteRows,
}: {
  userRows:   UserRow[];
  orgRows:    OrgRow[];
  inviteRows: InviteRow[];
}) {
  const [tab, setTab] = useState<Tab>('users');

  const pendingInvites = inviteRows.filter((r) => !r.isExpired).length;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {id === 'invites' && pendingInvites > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-px leading-none">
                {pendingInvites}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'users'   && <UsersPanel   rows={userRows} />}
      {tab === 'orgs'    && <OrgsTable    orgs={orgRows} userRows={userRows} />}
      {tab === 'invites' && <InvitesPanel rows={inviteRows} />}
    </div>
  );
}

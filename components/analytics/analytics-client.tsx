'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RangeToggle }               from './range-toggle';
import { CommitmentsSection }        from './commitments-section';
import { InboxHealthTab, type InboxHealthData } from './inbox-health-tab';
import type { Range }                from './range-toggle';
import type { CommitmentDataset }    from './commitments-section';

type Tab = 'noise' | 'tasks';

interface Props {
  validRange:      Range;
  rangeLabel:      string;
  inboxHealthData: InboxHealthData;
  outgoingDataset: CommitmentDataset;
  assignedDataset: CommitmentDataset;
}

export function AnalyticsClient({
  validRange, rangeLabel,
  inboxHealthData,
  outgoingDataset, assignedDataset,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tasks', label: 'Tasks'        },
    { id: 'noise', label: 'Inbox Health' },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            {rangeLabel} — inbox health and commitment data.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link href={`/api/analytics/export?range=${validRange}`}>
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Link>
          </Button>
          <RangeToggle current={validRange} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-5">
        {activeTab === 'noise' && <InboxHealthTab data={inboxHealthData} />}
        {activeTab === 'tasks' && <CommitmentsSection outgoing={outgoingDataset} assigned={assignedDataset} />}
      </div>

    </div>
  );
}

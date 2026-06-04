'use client';

// WhatToDoNext — three ranked action cards shown on the home page.
// Surfaces the single highest-impact action per problem area so users
// can act immediately without needing to explore the dashboard.

import Link from 'next/link';
import { Zap, Package, Bot, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HomepageSummary } from '@/app/actions/engagement';

interface Card {
  icon:     React.ElementType;
  title:    string;
  body:     string;
  cta:      string;
  href:     string;
  done:     boolean;
  priority: number; // lower = more urgent
}

function ActionCard({ icon: Icon, title, body, cta, href, done }: Omit<Card, 'priority'>) {
  return (
    <div className={cn(
      'flex items-start gap-4 rounded-xl border p-4 transition-colors',
      done
        ? 'border-border bg-muted/30 opacity-70'
        : 'border-border bg-card hover:border-primary/30 hover:bg-primary/5',
    )}>
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        done ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary',
      )}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', done && 'line-through text-muted-foreground')}>
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
      </div>
      {!done && (
        <Button size="sm" variant="outline" asChild className="shrink-0 h-8 text-xs gap-1">
          <Link href={href}>
            {cta}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export function WhatToDoNext({ summary }: { summary: HomepageSummary }) {
  const { refreshStatus, neverEngageCount, neverEngageEmails, bundleableSenders, autopilotEnabled } = summary;

  // Still scanning — show a single waiting card
  if (refreshStatus === 'never' || refreshStatus === 'running') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />
        <span>
          Scanning your inbox — action items will appear here once the analysis finishes.
        </span>
      </div>
    );
  }

  const cards: Card[] = [
    {
      icon:     Zap,
      title:    neverEngageCount > 0
        ? `Clean up ${neverEngageCount.toLocaleString()} never-open senders`
        : 'No noise senders',
      body:     neverEngageCount > 0
        ? `~${neverEngageEmails.toLocaleString()} emails from senders you never read. Delete them in one pass.`
        : "Your inbox is clean — no senders you consistently ignore.",
      cta:      'Deep Clean',
      href:     '/sender-intelligence',
      done:     neverEngageCount === 0,
      priority: 1,
    },
    {
      icon:     Package,
      title:    bundleableSenders > 0
        ? `Bundle ${bundleableSenders} newsletter sender${bundleableSenders !== 1 ? 's' : ''}`
        : 'Newsletters under control',
      body:     bundleableSenders > 0
        ? 'Move them to a daily digest so they stop cluttering your inbox in real time.'
        : 'No unsubscribable senders flooding your inbox.',
      cta:      'Set up Bundle',
      href:     '/sender-intelligence',
      done:     bundleableSenders === 0,
      priority: 2,
    },
    {
      icon:     Bot,
      title:    autopilotEnabled ? 'Autopilot is active' : 'Enable autopilot',
      body:     autopilotEnabled
        ? 'Future noise is handled automatically — no manual action needed.'
        : 'Let autopilot clean future noise automatically. Runs quietly in the background.',
      cta:      autopilotEnabled ? 'Manage rules' : 'Enable',
      href:     '/sender-intelligence',
      done:     autopilotEnabled,
      priority: 3,
    },
  ].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.priority - b.priority);

  const allDone = cards.every((c) => c.done);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {allDone ? 'Inbox in great shape' : 'What to do next'}
        </h2>
        <Link
          href="/sender-intelligence"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Open Inbox Cleaner <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {cards.map((card) => (
        <ActionCard key={card.title} {...card} />
      ))}
    </div>
  );
}

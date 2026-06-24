'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MessageSquare, ListChecks, SlidersHorizontal,
  Check, ArrowRight, ExternalLink,
} from 'lucide-react';

// ─── Pillar definitions ───────────────────────────────────────────────────────

const PILLARS = [
  {
    id:          'reply',
    pillar:      'Reply',
    tagline:     'Know what needs you. Act in minutes.',
    description: 'AI scans your inbox and surfaces only the emails that need your attention — sorted by urgency, not arrival time. No more excavating your inbox to find what matters.',
    features: [
      'AI triage classifies every unread email into Needs Reply, Waiting On, or Low Priority',
      'The Draft Queue pre-writes replies so you can clear your list in one focused session',
      'Auto-triage runs when you open Gmail so every session starts with clarity',
    ],
    cta:      { label: 'Open Gmail', href: 'https://mail.google.com', external: true },
    icon:     MessageSquare,
    accent:   'text-blue-600 dark:text-blue-400',
    ctaCls:   'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
    divider:  'bg-blue-100 dark:bg-blue-900',
    bg:       'bg-blue-50 dark:bg-blue-950/40',
    border:   'border-blue-100 dark:border-blue-800',
    check:    'bg-blue-100 dark:bg-blue-900',
  },
  {
    id:          'track',
    pillar:      'Track',
    tagline:     'Never drop a ball. Never miss a follow-up.',
    description: 'Inbox Triage watches both sides of every conversation — what you\'ve committed to and what you\'re waiting on — so nothing slips through the cracks.',
    features: [
      'Automatically detects commitments in emails you send — no tagging required',
      'Tracks every thread where you\'re waiting on a reply from someone else',
      'Follow-up reminders surface automatically when a response is overdue',
    ],
    cta:      { label: 'View Track', href: '/track', external: false },
    icon:     ListChecks,
    accent:   'text-emerald-600 dark:text-emerald-400',
    ctaCls:   'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300',
    divider:  'bg-emerald-100 dark:bg-emerald-900',
    bg:       'bg-emerald-50 dark:bg-emerald-950/40',
    border:   'border-emerald-100 dark:border-emerald-800',
    check:    'bg-emerald-100 dark:bg-emerald-900',
  },
  {
    id:          'tune',
    pillar:      'Tune',
    tagline:     'Tune out the noise, automatically.',
    description: 'Sender intelligence learns which senders matter to you and quietly filters out the rest. The longer you use it, the quieter your inbox becomes.',
    features: [
      'Learns from your reply and dismiss behavior to sharpen signal over time',
      'Auto-filters newsletters, receipts, social alerts, and low-value senders',
      'Sender rules give you manual control whenever you want it',
    ],
    cta:      { label: 'Open Tune', href: '/sender-intelligence', external: false },
    icon:     SlidersHorizontal,
    accent:   'text-violet-600 dark:text-violet-400',
    ctaCls:   'text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300',
    divider:  'bg-violet-100 dark:bg-violet-900',
    bg:       'bg-violet-50 dark:bg-violet-950/40',
    border:   'border-violet-100 dark:border-violet-800',
    check:    'bg-violet-100 dark:bg-violet-900',
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onComplete?: () => void;
  showCta?: boolean;
}

export function OnboardingFlow({ onComplete, showCta = true }: Props) {
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';
  const gmailUrl = `https://mail.google.com/mail/u/${gmailAcct}/`;

  return (
    <div className="w-full space-y-8 py-6">

      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">How Inbox Triage works</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Three pillars that turn your Gmail into a system — so nothing piles up, nothing slips, and the noise stays out.
        </p>
      </div>

      {/* 3-column pillar cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              className={cn(
                'rounded-2xl border p-6 flex flex-col gap-5',
                p.bg, p.border,
              )}
            >
              {/* Icon + name */}
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-background/70">
                  <Icon className={cn('w-5 h-5', p.accent)} />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{p.pillar}</h3>
                  <p className={cn('text-xs font-semibold mt-0.5', p.accent)}>{p.tagline}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.description}
              </p>

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {p.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <div className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      p.check,
                    )}>
                      <Check className={cn('w-2.5 h-2.5', p.accent)} />
                    </div>
                    <span className="text-xs leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Divider + CTA */}
              <div className={cn('h-px w-full', p.divider)} />
              {p.cta.external ? (
                <a
                  href={p.id === 'reply' ? gmailUrl : p.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
                    p.ctaCls,
                  )}
                >
                  {p.cta.label}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <Link
                  href={p.cta.href}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
                    p.ctaCls,
                  )}
                >
                  {p.cta.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Get started */}
      {showCta && onComplete && (
        <div className="flex justify-center pt-2">
          <Button onClick={onComplete} className="gap-2">
            Get started
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

    </div>
  );
}

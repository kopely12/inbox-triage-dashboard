'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Minus, Zap, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tier = 'free' | 'pro' | 'team';

const PLANS = [
  {
    id:          'free' as Tier,
    name:        'Free',
    price:       '$0',
    period:      'forever',
    description: 'For individuals getting started.',
    icon:        Sparkles,
    featured:    false,
    features: [
      { label: 'Triages per month',    value: '50'         },
      { label: 'Emails per scan',      value: '20'         },
      { label: 'Commitment tracking',  value: true         },
      { label: 'Analytics',            value: 'Basic'      },
      { label: 'Team members',         value: '1'          },
      { label: 'AI draft replies',     value: false        },
      { label: 'Priority support',     value: false        },
      { label: 'Data export',          value: false        },
    ],
  },
  {
    id:          'pro' as Tier,
    name:        'Pro',
    price:       '$12',
    period:      'per month',
    description: 'For power users who live in their inbox.',
    icon:        Zap,
    featured:    true,
    features: [
      { label: 'Triages per month',    value: 'Unlimited'  },
      { label: 'Emails per scan',      value: '100'        },
      { label: 'Commitment tracking',  value: true         },
      { label: 'Analytics',            value: 'Full'       },
      { label: 'Team members',         value: '1'          },
      { label: 'AI draft replies',     value: true         },
      { label: 'Priority support',     value: true         },
      { label: 'Data export',          value: true         },
    ],
  },
  {
    id:          'team' as Tier,
    name:        'Team',
    price:       '$39',
    period:      'per month',
    description: 'For teams that need shared visibility.',
    icon:        Users,
    featured:    false,
    features: [
      { label: 'Triages per month',    value: 'Unlimited'  },
      { label: 'Emails per scan',      value: '100'        },
      { label: 'Commitment tracking',  value: true         },
      { label: 'Analytics',            value: 'Full + Export' },
      { label: 'Team members',         value: 'Up to 20'   },
      { label: 'AI draft replies',     value: true         },
      { label: 'Priority support',     value: true         },
      { label: 'Data export',          value: true         },
    ],
  },
] as const;

function comingSoon() {
  toast('Billing coming soon', {
    description: "We'll notify you when upgrade options are available.",
  });
}

function PlanCTA({ planId, currentPlan }: { planId: Tier; currentPlan: Tier }) {
  const isCurrent = planId === currentPlan;

  const planRank: Record<Tier, number> = { free: 0, pro: 1, team: 2 };
  const isUpgrade   = planRank[planId] > planRank[currentPlan];
  const isDowngrade = planRank[planId] < planRank[currentPlan];

  if (isCurrent) {
    return (
      <Button variant="outline" size="sm" className="w-full" disabled>
        Current plan
      </Button>
    );
  }

  if (planId === 'team') {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={comingSoon}>
        Contact us
      </Button>
    );
  }

  if (isUpgrade) {
    return (
      <Button size="sm" className="w-full gap-1.5" onClick={comingSoon}>
        <Zap className="w-3.5 h-3.5" />
        Upgrade
      </Button>
    );
  }

  if (isDowngrade) {
    return (
      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={comingSoon}>
        Downgrade
      </Button>
    );
  }

  return null;
}

export function PricingTable({ currentPlan }: { currentPlan: Tier }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {PLANS.map((plan) => {
        const Icon      = plan.icon;
        const isCurrent = plan.id === currentPlan;

        return (
          <div
            key={plan.id}
            className={cn(
              'relative flex flex-col rounded-xl border bg-card p-5 gap-4',
              plan.featured && !isCurrent && 'border-primary/50 shadow-sm',
              isCurrent     && 'border-primary ring-1 ring-primary/30',
            )}
          >
            {/* Featured badge */}
            {plan.featured && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                Most popular
              </span>
            )}

            {/* Plan header */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{plan.name}</span>
                {isCurrent && <Badge variant="secondary" className="text-[10px] ml-auto">Current</Badge>}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{plan.price}</span>
                <span className="text-xs text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-xs text-muted-foreground">{plan.description}</p>
            </div>

            {/* Features */}
            <ul className="space-y-2 flex-1">
              {plan.features.map(({ label, value }) => (
                <li key={label} className="flex items-center gap-2 text-xs">
                  {value === false ? (
                    <Minus className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className={cn('flex-1', value === false && 'text-muted-foreground/60')}>
                    {label}
                  </span>
                  {value !== true && value !== false && (
                    <span className="font-medium text-foreground">{value}</span>
                  )}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <PlanCTA planId={plan.id} currentPlan={currentPlan} />
          </div>
        );
      })}
    </div>
  );
}

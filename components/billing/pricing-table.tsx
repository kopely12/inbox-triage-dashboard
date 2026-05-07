'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Minus, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── types ───────────────────────────────────────────────────────────────────

type PlanId      = 'free' | 'pro' | 'team';
type PlanType    = 'individual' | 'team';
type BillingCycle = 'monthly' | 'annual';

type Feature = { label: string; value: string | boolean };

type Plan = {
  id:                 PlanId;
  name:               string;
  monthlyPrice:       number;
  annualMonthly:      number;   // per-month rate when billed annually
  annualTotal:        number;   // total charged once per year
  annualSavingsPct:   number;
  description:        string;
  featured:           boolean;
  showFor:            PlanType[];
  features:           Feature[];
};

// ─── plan data ────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id:               'free',
    name:             'Free',
    monthlyPrice:     0,
    annualMonthly:    0,
    annualTotal:      0,
    annualSavingsPct: 0,
    description:      'For individuals just getting started.',
    featured:         false,
    showFor:          ['individual'],
    features: [
      { label: 'Triages per month',    value: '50'        },
      { label: 'Emails per scan',      value: '20'        },
      { label: 'Commitment tracking',  value: true        },
      { label: 'Analytics',            value: 'Basic'     },
      { label: 'AI draft replies',     value: false       },
      { label: 'Priority support',     value: false       },
      { label: 'Data export',          value: false       },
    ],
  },
  {
    id:               'pro',
    name:             'Pro',
    monthlyPrice:     12,
    annualMonthly:    9,
    annualTotal:      108,
    annualSavingsPct: 25,
    description:      'For power users who live in their inbox.',
    featured:         true,
    showFor:          ['individual', 'team'],
    features: [
      { label: 'Triages per month',    value: 'Unlimited' },
      { label: 'Emails per scan',      value: '100'       },
      { label: 'Commitment tracking',  value: true        },
      { label: 'Analytics',            value: 'Full'      },
      { label: 'AI draft replies',     value: true        },
      { label: 'Priority support',     value: true        },
      { label: 'Data export',          value: true        },
    ],
  },
  {
    id:               'team',
    name:             'Team',
    monthlyPrice:     39,
    annualMonthly:    29,
    annualTotal:      348,
    annualSavingsPct: 26,
    description:      'For teams that need shared visibility.',
    featured:         false,
    showFor:          ['team'],
    features: [
      { label: 'Triages per month',    value: 'Unlimited' },
      { label: 'Emails per scan',      value: '100'       },
      { label: 'Commitment tracking',  value: true        },
      { label: 'Analytics',            value: 'Full + export' },
      { label: 'AI draft replies',     value: true        },
      { label: 'Priority support',     value: true        },
      { label: 'Up to 20 team members', value: true       },
    ],
  },
];

// ─── sub-components ───────────────────────────────────────────────────────────

function TypeToggle({ value, onChange }: { value: PlanType; onChange: (v: PlanType) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-border bg-muted p-0.5">
      {(['individual', 'team'] as PlanType[]).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'px-5 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
            value === opt
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function CycleToggle({ value, onChange }: { value: BillingCycle; onChange: (v: BillingCycle) => void }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <button
        onClick={() => onChange('monthly')}
        className={cn('transition-colors', value === 'monthly' ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
      >
        Monthly
      </button>

      {/* pill toggle */}
      <button
        role="switch"
        aria-checked={value === 'annual'}
        onClick={() => onChange(value === 'monthly' ? 'annual' : 'monthly')}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          value === 'annual' ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
            value === 'annual' ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>

      <button
        onClick={() => onChange('annual')}
        className={cn('flex items-center gap-1.5 transition-colors', value === 'annual' ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
      >
        Annual
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-emerald-600 bg-emerald-50 border-emerald-200">
          Save 25%
        </Badge>
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  currentPlan,
  isFree,
}: {
  plan:        Plan;
  cycle:       BillingCycle;
  currentPlan: PlanId;
  isFree:      boolean;
}) {
  const isCurrent  = plan.id === currentPlan;
  const price      = plan.monthlyPrice === 0 ? 0 : (cycle === 'annual' ? plan.annualMonthly : plan.monthlyPrice);
  const planRank: Record<PlanId, number> = { free: 0, pro: 1, team: 2 };
  const isUpgrade  = planRank[plan.id] > planRank[currentPlan];
  const isDowngrade = planRank[plan.id] < planRank[currentPlan];

  function handleCTA() {
    toast('Billing coming soon', {
      description: "We'll notify you when upgrade options are available.",
    });
  }

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-card p-6 gap-5',
        plan.featured && !isCurrent && 'border-primary/40 shadow-sm',
        isCurrent && 'border-primary ring-1 ring-primary/20',
      )}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
          Most popular
        </span>
      )}

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{plan.name}</span>
          {isCurrent && <Badge variant="secondary" className="text-[10px]">Current plan</Badge>}
        </div>

        <div>
          {plan.monthlyPrice === 0 ? (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-sm text-muted-foreground">forever</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">${price}</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              {cycle === 'annual' && (
                <p className="text-xs text-muted-foreground">
                  ${plan.annualTotal} billed annually
                  <span className="ml-1.5 text-emerald-600 font-medium">
                    (save ${plan.monthlyPrice * 12 - plan.annualTotal}/yr)
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{plan.description}</p>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 flex-1">
        {plan.features.map(({ label, value }) => (
          <li key={label} className="flex items-start gap-2 text-xs">
            {value === false ? (
              <Minus className="w-3.5 h-3.5 mt-px text-muted-foreground/40 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 mt-px text-emerald-500 shrink-0" />
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
      {isCurrent ? (
        <Button variant="outline" size="sm" className="w-full" disabled>
          Current plan
        </Button>
      ) : plan.id === 'team' && isFree ? (
        <Button variant="outline" size="sm" className="w-full" onClick={handleCTA}>
          Contact us
        </Button>
      ) : isUpgrade ? (
        <Button size="sm" className="w-full gap-1.5" onClick={handleCTA}>
          <Zap className="w-3.5 h-3.5" />
          Upgrade to {plan.name}
        </Button>
      ) : isDowngrade ? (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleCTA}>
          Downgrade to {plan.name}
        </Button>
      ) : (
        <Button size="sm" className="w-full" onClick={handleCTA}>
          Get started
        </Button>
      )}
    </div>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

export function PricingTable({ currentPlan }: { currentPlan: PlanId }) {
  const [planType, setPlanType] = useState<PlanType>('individual');
  const [cycle,    setCycle]    = useState<BillingCycle>('monthly');

  const visiblePlans = PLANS.filter((p) => p.showFor.includes(planType));
  const isFree = currentPlan === 'free';

  return (
    <div className="space-y-6">
      {/* Toggles */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <TypeToggle  value={planType} onChange={setPlanType} />
        <CycleToggle value={cycle}    onChange={setCycle}    />
      </div>

      {/* Cards */}
      <div className={cn(
        'grid gap-4',
        visiblePlans.length === 2 ? 'sm:grid-cols-2 max-w-2xl' : 'sm:grid-cols-3',
      )}>
        {visiblePlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            currentPlan={currentPlan}
            isFree={isFree}
          />
        ))}
      </div>
    </div>
  );
}

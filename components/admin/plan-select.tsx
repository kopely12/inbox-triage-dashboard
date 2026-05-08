'use client';

import { useTransition } from 'react';
import { setUserPlan } from '@/app/actions/admin';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PLANS = ['free', 'pro', 'team'] as const;
type PlanId = (typeof PLANS)[number];

export function PlanSelect({ userId, currentPlan }: { userId: string; currentPlan: PlanId }) {
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPlan = e.target.value as PlanId;
    if (newPlan === currentPlan) return;
    startTransition(async () => {
      try {
        await setUserPlan(userId, newPlan);
        toast.success(`Plan updated to ${newPlan}`);
      } catch {
        toast.error('Failed to update plan');
      }
    });
  }

  return (
    <select
      defaultValue={currentPlan}
      onChange={handleChange}
      disabled={pending}
      className={cn(
        'h-7 rounded-md border border-input bg-background px-2 text-xs',
        'focus:outline-none focus:ring-1 focus:ring-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed capitalize',
      )}
    >
      {PLANS.map((p) => (
        <option key={p} value={p} className="capitalize">
          {p}
        </option>
      ))}
    </select>
  );
}

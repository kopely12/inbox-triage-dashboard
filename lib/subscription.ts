/**
 * Subscription helpers — single source of truth for plan/access logic.
 * Used server-side (server components, server actions) only.
 */

export type OrgBilling = {
  plan_tier:            string;
  billing_provider:     string;
  subscription_status:  string;
  current_period_end:   string | null;
  seat_count:           number;
};

export type UserPlan = {
  plan_tier:    string | null;
  suspended_at: string | null;
};

// ─── org active check ─────────────────────────────────────────────────────────

export function isOrgActive(org: OrgBilling): boolean {
  if (org.subscription_status === 'canceled') return false;
  if (org.subscription_status === 'past_due') return false;
  if (org.current_period_end && new Date(org.current_period_end) < new Date()) return false;
  return true;
}

// ─── effective plan ───────────────────────────────────────────────────────────

/**
 * Returns the plan that actually governs a user's access.
 * Team membership takes precedence over individual plan.
 */
export function getEffectivePlan(user: UserPlan, org?: OrgBilling | null): string {
  if (user.suspended_at) return 'suspended';
  if (org && isOrgActive(org))  return org.plan_tier;
  return user.plan_tier ?? 'free';
}

// ─── seat availability ────────────────────────────────────────────────────────

export function hasSeatsAvailable(org: OrgBilling, activeMemberCount: number): boolean {
  return activeMemberCount < org.seat_count;
}

export function seatsRemaining(org: OrgBilling, activeMemberCount: number): number {
  return Math.max(0, org.seat_count - activeMemberCount);
}

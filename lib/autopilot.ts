// lib/autopilot.ts — shared types and config (no 'use server', safe to import client-side)

export type AutopilotRuleType =
  | 'delete_without_open'          // deleted N+ times, never opened → unsubscribe
  | 'low_engagement_archive'       // engagement rate < threshold → auto_archive
  | 'never_replied_after_n_emails' // sent N+ emails, user never replied → unsubscribe
  | 'frequency_spike_unsubscribe'  // noise sender emails > N/day → unsubscribe
  | 'lapsed_engagement_unsubscribe'; // used to engage but stopped recently → unsubscribe

export type AutopilotAction = 'unsubscribe' | 'auto_archive' | 'ignore';

export type AutopilotRule = {
  id:              string;
  rule_type:       AutopilotRuleType;
  threshold:       Record<string, number>;
  action:          AutopilotAction;
  enabled:         boolean;
  created_at:      string;
  last_applied_at: string | null;
  applied_count:   number;
};

export type AutopilotRuleMeta = {
  label:            string;
  description:      (threshold: Record<string, number>) => string;
  defaultThreshold: Record<string, number>;
  defaultAction:    AutopilotAction;
  thresholdLabel:   string;
  thresholdKey:     string;
  thresholdMin:     number;
  thresholdMax:     number;
};

export const AUTOPILOT_RULE_META: Record<AutopilotRuleType, AutopilotRuleMeta> = {
  delete_without_open: {
    label:            'Auto-unsubscribe from ignored senders',
    description:      (t) => `Unsubscribes when you delete ${t.count ?? 5}+ emails from the same sender without ever opening one — the clearest possible signal you want out.`,
    defaultThreshold: { count: 5 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Minimum deletes without opening',
    thresholdKey:     'count',
    thresholdMin:     3,
    thresholdMax:     20,
  },
  low_engagement_archive: {
    label:            'Auto-archive very low engagement senders',
    description:      (t) => `Archives senders with an open rate below ${t.rate ?? 3}% (requires at least ${t.min_emails ?? 10} emails from them) — future emails skip your inbox without unsubscribing.`,
    defaultThreshold: { rate: 3, min_emails: 10 },
    defaultAction:    'auto_archive',
    thresholdLabel:   'Max engagement rate (%)',
    thresholdKey:     'rate',
    thresholdMin:     1,
    thresholdMax:     10,
  },
  never_replied_after_n_emails: {
    label:            'Unsubscribe if you\'ve never replied',
    description:      (t) => `Unsubscribes from senders who've sent ${t.count ?? 10}+ emails but you've never replied once. Only applies to senders you Never or Rarely open — transactional and high-engagement senders are excluded.`,
    defaultThreshold: { count: 10 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Minimum emails without a reply',
    thresholdKey:     'count',
    thresholdMin:     5,
    thresholdMax:     50,
  },
  frequency_spike_unsubscribe: {
    label:            'Unsubscribe from high-frequency noise senders',
    description:      (t) => `Unsubscribes noise senders (Never/Rarely Open) who average more than ${t.daily_rate ?? 1} email${(t.daily_rate ?? 1) !== 1 ? 's' : ''} per day over your 90-day analysis window.`,
    defaultThreshold: { daily_rate: 1 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Max emails per day (avg)',
    thresholdKey:     'daily_rate',
    thresholdMin:     1,
    thresholdMax:     10,
  },
  lapsed_engagement_unsubscribe: {
    label:            'Unsubscribe from lapsed senders',
    description:      (t) => `Unsubscribes from senders you used to open at least ${t.min_prior_rate ?? 20}% of the time but haven't engaged with in the last 30 days. Raise the threshold to target only your once-favorite senders.`,
    defaultThreshold: { min_prior_rate: 20 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Minimum prior open rate (%) to qualify',
    thresholdKey:     'min_prior_rate',
    thresholdMin:     10,
    thresholdMax:     60,
  },
};

export const AUTOPILOT_RULE_TYPES: AutopilotRuleType[] = [
  'delete_without_open',
  'low_engagement_archive',
  'never_replied_after_n_emails',
  'frequency_spike_unsubscribe',
  'lapsed_engagement_unsubscribe',
];

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
  description:      string;
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
    description:      'Automatically unsubscribes when you delete emails from a sender without ever opening one — the clearest possible signal you want out.',
    defaultThreshold: { count: 5 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Minimum deletes without opening',
    thresholdKey:     'count',
    thresholdMin:     3,
    thresholdMax:     20,
  },
  low_engagement_archive: {
    label:            'Auto-archive very low engagement senders',
    description:      'Auto-archives senders where your engagement rate falls below a threshold — keeps them out of your inbox without unsubscribing.',
    defaultThreshold: { rate: 3, min_emails: 10 },
    defaultAction:    'auto_archive',
    thresholdLabel:   'Max engagement rate (%)',
    thresholdKey:     'rate',
    thresholdMin:     1,
    thresholdMax:     10,
  },
  never_replied_after_n_emails: {
    label:            'Unsubscribe if you\'ve never replied',
    description:      'Automatically unsubscribes from senders who\'ve sent many emails but you\'ve never once replied — a strong signal you don\'t value the relationship.',
    defaultThreshold: { count: 10 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Minimum emails without a reply',
    thresholdKey:     'count',
    thresholdMin:     5,
    thresholdMax:     50,
  },
  frequency_spike_unsubscribe: {
    label:            'Unsubscribe from high-frequency noise senders',
    description:      'Auto-unsubscribes noise senders (Never Open / Rarely Open) who email more than a set number of times per day on average.',
    defaultThreshold: { daily_rate: 1 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Max emails per day (avg)',
    thresholdKey:     'daily_rate',
    thresholdMin:     1,
    thresholdMax:     10,
  },
  lapsed_engagement_unsubscribe: {
    label:            'Unsubscribe from lapsed senders',
    description:      'Auto-unsubscribes from senders you used to engage with but have stopped opening in the last 30 days — clears out newsletters you\'ve grown out of.',
    defaultThreshold: { min_prior_rate: 20 },
    defaultAction:    'unsubscribe',
    thresholdLabel:   'Minimum prior engagement rate (%)',
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

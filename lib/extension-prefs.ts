// Shared types and defaults for extension preferences.
// Deliberately NOT a 'use server' file — imported by both server actions and client components.

export type PriorityRule = { pattern: string; urgency: 'high' | 'medium' | 'low' };

export type ExtensionPrefs = {
  whitelist:            string[];
  blacklist:            string[];
  priority_rules:       PriorityRule[];
  triage_depth:         string;
  working_hours:        { start: string; end: string; days: string[] };
  auto_triage:          string;
  auto_triage_time:     string;
  snooze_default:       string;
  read_body:            boolean;
  read_sent:            boolean;
  read_old:             boolean;
  read_promo:           boolean;
  skip_newsletters:     boolean;
  skip_receipts:        boolean;
  skip_calendar:        boolean;
  skip_social:          boolean;
  skip_financial:       boolean;
  compose_detection:    boolean;
  followup_suggestions: boolean;
  draft_replies:        boolean;
  overdue_days:         number;
  personal_context:     string;
  internal_domains:     string[];
  keyboard_shortcuts:   boolean;
  tasks_default_view:   string;
  theme:                string;
};

export const PREFS_DEFAULTS: ExtensionPrefs = {
  whitelist: [], blacklist: [], priority_rules: [],
  triage_depth: '20',
  working_hours: { start: '09:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  auto_triage: 'manual', auto_triage_time: '08:00', snooze_default: 'tomorrow',
  read_body: true, read_sent: true, read_old: false, read_promo: false,
  skip_newsletters: true, skip_receipts: true, skip_calendar: true,
  skip_social: false, skip_financial: false,
  compose_detection: true, followup_suggestions: true, draft_replies: true,
  overdue_days: 14, personal_context: '', internal_domains: [],
  keyboard_shortcuts: true, tasks_default_view: 'grouped', theme: 'auto',
};

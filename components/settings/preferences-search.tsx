'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input }     from '@/components/ui/input';

const SECTIONS = [
  { id: 'gmail',          label: 'Gmail connection',     keywords: ['gmail', 'connect', 'google', 'account', 'oauth', 'email'] },
  { id: 'triage',         label: 'Triage & Scanning',    keywords: ['triage', 'scan', 'frequency', 'auto', 'schedule', 'depth'] },
  { id: 'email-scanning', label: 'Email scanning',       keywords: ['scan', 'email', 'inbox', 'filter', 'body', 'sent', 'promo', 'old'] },
  { id: 'sender-rules',   label: 'Sender rules',         keywords: ['sender', 'pin', 'suppress', 'whitelist', 'blacklist', 'always', 'never', 'block', 'priority'] },
  { id: 'ai-context',     label: 'AI & context',         keywords: ['ai', 'context', 'personal', 'model', 'prompt', 'intelligence', 'draft', 'compose'] },
  { id: 'tasks',          label: 'Tasks & commitments',  keywords: ['task', 'commitment', 'promise', 'reminder', 'deadline', 'followup', 'overdue'] },
  { id: 'interface',      label: 'Interface',            keywords: ['interface', 'display', 'theme', 'ui', 'appearance', 'keyboard', 'shortcuts', 'dark'] },
  { id: 'time',           label: 'Time & reminders',     keywords: ['timezone', 'time', 'reminder', 'snooze', 'hours', 'working', 'schedule'] },
  { id: 'account',        label: 'Account',              keywords: ['account', 'delete', 'data', 'export', 'download', 'danger'] },
];

export function PreferencesSearch() {
  const [query,    setQuery]    = useState('');
  const [focused,  setFocused]  = useState(false);

  const q       = query.toLowerCase().trim();
  const matches = q
    ? SECTIONS.filter((s) =>
        s.label.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q)),
      )
    : [];

  const showDropdown = focused && q.length > 0;

  return (
    <div className="relative max-w-sm">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search preferences…"
          className={`pl-8 h-8 text-sm ${q ? 'pr-8' : ''}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {q && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-md shadow-md z-50 py-1">
          {matches.length > 0 ? (
            matches.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setQuery('')}
                className="flex items-center px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {s.label}
              </a>
            ))
          ) : (
            <div className="px-3 py-2">
              <p className="text-xs text-muted-foreground">
                No settings found for &quot;{query}&quot;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

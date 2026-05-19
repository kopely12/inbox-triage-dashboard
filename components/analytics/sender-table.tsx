import { cn } from '@/lib/utils';
import Link from 'next/link';

export type SenderRow = {
  email:    string;
  name:     string | null;
  open:     number;
  done:     number;
  health:   'green' | 'yellow' | 'red';
  trend:    'up' | 'down' | 'flat';
  lastDate: string | null;
};

const HEALTH_DOT: Record<SenderRow['health'], string> = {
  green:  'bg-green-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
};

const HEALTH_TITLE: Record<SenderRow['health'], string> = {
  green:  'On track — low open commitment backlog',
  yellow: 'Worth watching — backlog growing',
  red:    'Needs attention — high overdue backlog',
};

// ↑ red = backlog growing (bad), ↓ green = backlog shrinking (good)
const TREND_ICON: Record<SenderRow['trend'], { char: string; cls: string; title: string }> = {
  up:   { char: '↑', cls: 'text-red-500',                       title: 'Backlog growing' },
  down: { char: '↓', cls: 'text-green-600 dark:text-green-400', title: 'Backlog shrinking' },
  flat: { char: '→', cls: 'text-muted-foreground',              title: 'Stable' },
};

function relativeDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function SenderTable({ senders }: { senders: SenderRow[] }) {
  if (senders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
        <p className="text-sm font-medium text-foreground">No sender data yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          The people you make commitments to will appear here once the extension detects them.
        </p>
      </div>
    );
  }

  const maxOpen = Math.max(...senders.map((s) => s.open), 1);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-2 text-left font-medium">Sender</th>
              <th className="pb-2 text-right font-medium w-14">Open</th>
              <th className="pb-2 text-right font-medium w-12">Done</th>
              <th className="pb-2 pl-3 text-left font-medium w-20">Load</th>
              <th className="pb-2 text-right font-medium w-20">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {senders.map((row) => {
              const trend    = TREND_ICON[row.trend];
              const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${row.email}`)}`;

              return (
                <tr key={row.email} className="border-b last:border-0 group">
                  {/* Sender identity */}
                  <td className="py-2 pr-3 max-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn('shrink-0 w-2 h-2 rounded-full', HEALTH_DOT[row.health])}
                        title={HEALTH_TITLE[row.health]}
                      />
                      <div className="min-w-0">
                        <a
                          href={gmailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-medium hover:underline"
                          title={`Search Gmail for emails from ${row.email}`}
                        >
                          {row.name || row.email}
                        </a>
                        {row.name && (
                          <span className="block truncate text-xs text-muted-foreground">{row.email}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Open + trend */}
                  <td className="py-2 text-right tabular-nums">
                    <span className="flex items-center justify-end gap-1">
                      {row.open}
                      <span
                        className={cn('text-xs font-medium leading-none', trend.cls)}
                        title={trend.title}
                        aria-label={trend.title}
                      >
                        {trend.char}
                      </span>
                    </span>
                  </td>

                  {/* Done */}
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{row.done}</td>

                  {/* Open load bar */}
                  <td className="py-2 pl-3">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          row.health === 'red'    ? 'bg-red-500'   :
                          row.health === 'yellow' ? 'bg-amber-400' :
                          'bg-chart-2',
                        )}
                        style={{ width: `${Math.round((row.open / maxOpen) * 100)}%` }}
                      />
                    </div>
                  </td>

                  {/* Last seen */}
                  <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                    {relativeDate(row.lastDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: link to full senders page */}
      <div className="flex justify-end pt-1 border-t border-border">
        <Link
          href="/senders"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all in Senders →
        </Link>
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';

export type SenderRow = {
  email:   string;
  name:    string | null;
  open:    number;
  done:    number;
  health:  'green' | 'yellow' | 'red';
  trend:   'up' | 'down' | 'flat';
};

const HEALTH_DOT: Record<SenderRow['health'], string> = {
  green:  'bg-green-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
};

const HEALTH_TITLE: Record<SenderRow['health'], string> = {
  green:  'On track',
  yellow: 'Worth watching',
  red:    'Needs attention',
};

const TREND_ICON: Record<SenderRow['trend'], { char: string; cls: string; title: string }> = {
  up:   { char: '↑', cls: 'text-red-500',                          title: 'Open tasks increasing' },
  down: { char: '↓', cls: 'text-green-600 dark:text-green-400',    title: 'Open tasks decreasing' },
  flat: { char: '→', cls: 'text-muted-foreground',                 title: 'Stable' },
};

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="pb-2 text-left font-medium">Sender</th>
            <th className="pb-2 text-right font-medium w-12">Open</th>
            <th className="pb-2 text-right font-medium w-14">Done</th>
            <th className="pb-2 pl-3 text-left font-medium w-24">Open load</th>
          </tr>
        </thead>
        <tbody>
          {senders.map((row) => {
            const trend  = TREND_ICON[row.trend];
            const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${row.email}`)}`;

            return (
              <tr key={row.email} className="border-b last:border-0 group">
                <td className="py-2 pr-3 max-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Health dot */}
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
                        title={`Search Gmail for ${row.email}`}
                      >
                        {row.name || row.email}
                      </a>
                      {row.name && (
                        <span className="block truncate text-xs text-muted-foreground">{row.email}</span>
                      )}
                    </div>
                  </div>
                </td>
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
                <td className="py-2 text-right tabular-nums text-muted-foreground">{row.done}</td>
                <td className="py-2 pl-3">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        row.health === 'red'
                          ? 'bg-red-500'
                          : row.health === 'yellow'
                          ? 'bg-amber-400'
                          : 'bg-chart-2',
                      )}
                      style={{ width: `${Math.round((row.open / maxOpen) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

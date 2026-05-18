import { cn } from '@/lib/utils';

export function PromiseAccountability({
  keptRate,
  overdueCount,
  thisWeekCreated,
  lastWeekCreated,
  total30d,
}: {
  keptRate:         number | null;
  overdueCount:     number;
  thisWeekCreated:  number;
  lastWeekCreated:  number;
  total30d:         number;
}) {
  const wowPct =
    lastWeekCreated > 0
      ? Math.round(((thisWeekCreated - lastWeekCreated) / lastWeekCreated) * 100)
      : null;

  return (
    <div className="grid grid-cols-3 gap-4">

      {/* Promises kept rate */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Promises kept (30d)</p>
        {keptRate !== null ? (
          <>
            <p
              className={cn(
                'text-2xl font-semibold',
                keptRate >= 80
                  ? 'text-green-600 dark:text-green-400'
                  : keptRate >= 50
                  ? 'text-amber-500'
                  : 'text-red-500',
              )}
            >
              {keptRate}%
            </p>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  keptRate >= 80
                    ? 'bg-green-500'
                    : keptRate >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500',
                )}
                style={{ width: `${keptRate}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-2xl font-semibold text-muted-foreground">—</p>
        )}
        <p className="text-xs text-muted-foreground">
          {keptRate !== null
            ? keptRate >= 80
              ? 'Great track record'
              : keptRate >= 50
              ? 'Room to improve'
              : 'Needs attention'
            : total30d === 0
            ? 'No commitments yet'
            : 'Need 5+ to show %'}
        </p>
      </div>

      {/* Overdue */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Overdue (&gt;14 days open)</p>
        <p className={cn('text-2xl font-semibold', overdueCount > 0 ? 'text-red-500' : '')}>
          {overdueCount}
        </p>
        <p className="text-xs text-muted-foreground">
          {overdueCount === 0
            ? 'All up to date'
            : overdueCount === 1
            ? '1 promise past due'
            : `${overdueCount} promises past due`}
        </p>
      </div>

      {/* New this week vs last */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">New commitments this week</p>
        <p className="text-2xl font-semibold">{thisWeekCreated}</p>
        <p className="text-xs text-muted-foreground">
          {wowPct !== null ? (
            <span className={wowPct > 0 ? '' : wowPct < 0 ? 'text-green-600 dark:text-green-400' : ''}>
              {wowPct > 0 ? '+' : ''}{wowPct}% vs last week
            </span>
          ) : (
            `vs ${lastWeekCreated} last week`
          )}
        </p>
      </div>

    </div>
  );
}

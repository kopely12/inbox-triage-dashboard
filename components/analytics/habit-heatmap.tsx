import { cn } from '@/lib/utils';

export type HeatmapDay = {
  date:  string; // YYYY-MM-DD
  count: number;
};

function cellColor(count: number): string {
  if (count === 0) return 'bg-muted/50';
  if (count === 1) return 'bg-chart-2/40';
  if (count === 2) return 'bg-chart-2/70';
  return 'bg-chart-2';
}

const DOW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function HabitHeatmap({ days, totalTriages }: { days: HeatmapDay[]; totalTriages: number }) {
  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-28 gap-2 text-center">
        <p className="text-sm font-medium text-foreground">No triage history yet</p>
        <p className="text-xs text-muted-foreground">Each day you run a triage will light up here.</p>
      </div>
    );
  }

  // Build a 52-week grid aligned to Mon–Sun columns
  // Pad so the grid starts on the Monday of the first week
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // End of grid = Sunday of current week
  const endDate = new Date(today);
  const todayDow = today.getUTCDay(); // 0=Sun
  endDate.setUTCDate(today.getUTCDate() + (todayDow === 0 ? 0 : 7 - todayDow));

  // Start = 52 weeks before endDate Monday
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - 52 * 7 + 1);

  // Build lookup
  const countMap = new Map(days.map((d) => [d.date, d.count]));

  // Build columns (each column = one week Mon→Sun)
  const weeks: { date: Date; count: number }[][] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const week: { date: Date; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      week.push({ date: new Date(cursor), count: countMap.get(iso) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  // Build month labels (show month name at first week of each month)
  const monthLabels: { weekIdx: number; label: string }[] = [];
  weeks.forEach((week, idx) => {
    const firstDay = week[0].date;
    if (firstDay.getUTCDate() <= 7) {
      monthLabels.push({
        weekIdx: idx,
        label: firstDay.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      });
    }
  });

  const streak = (() => {
    let s = 0;
    const d = new Date(today);
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if ((countMap.get(iso) ?? 0) === 0) break;
      s++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return s;
  })();

  return (
    <div className="space-y-2">
      {/* Month labels */}
      <div className="flex gap-px pl-7" style={{ fontSize: 10 }}>
        {weeks.map((_, idx) => {
          const ml = monthLabels.find((m) => m.weekIdx === idx);
          return (
            <div key={idx} className="flex-1 text-muted-foreground" style={{ minWidth: 0 }}>
              {ml ? ml.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex gap-px">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-px mr-1" style={{ width: 24 }}>
          {DOW_LABELS.map((label, i) => (
            <div key={i} className="h-3 flex items-center justify-end">
              <span className="text-muted-foreground" style={{ fontSize: 9 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Week columns */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-px flex-1" style={{ minWidth: 0 }}>
            {week.map(({ date, count }, di) => {
              const isFuture = date > today;
              return (
                <div
                  key={di}
                  className={cn(
                    'h-3 rounded-sm transition-colors',
                    isFuture ? 'opacity-0' : cellColor(count),
                  )}
                  title={
                    isFuture
                      ? undefined
                      : `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${count} triage${count !== 1 ? 's' : ''}`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
        <span>{totalTriages} triage{totalTriages !== 1 ? 's' : ''} in the past year</span>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <span className="text-chart-2 font-medium">{streak}-day streak</span>
          )}
          <div className="flex items-center gap-1">
            <span>Less</span>
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className={cn('w-3 h-3 rounded-sm', cellColor(n))} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

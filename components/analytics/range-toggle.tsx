'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: '4w',  label: '4W'  },
  { value: '12w', label: '12W' },
  { value: '6m',  label: '6M'  },
] as const;

export type Range = '4w' | '12w' | '6m';

export function RangeToggle({ current }: { current: Range }) {
  const router = useRouter();
  return (
    <div className="flex gap-0.5 rounded-md border border-border bg-muted p-0.5">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => router.push(`/analytics?range=${value}`)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded transition-colors',
            current === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

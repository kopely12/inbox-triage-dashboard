import { Card, CardContent } from '@/components/ui/card';

function Bone({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className}`} />;
}

function RowSkeleton() {
  return (
    <div className="px-5 py-4 flex items-start gap-3">
      {/* direction indicator */}
      <Bone className="w-3.5 h-3.5 mt-0.5 shrink-0 rounded-sm" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start gap-2">
          <Bone className="h-4 flex-1 max-w-sm" />
          <Bone className="h-4 w-12 rounded-full shrink-0" />
        </div>
        <div className="flex items-center gap-3">
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

export default function CommitmentsLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Bone className="h-6 w-32" />
          <Bone className="h-3.5 w-80" />
        </div>
        <Bone className="h-8 w-28 rounded-md" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Status tabs */}
        <Bone className="h-9 w-72 rounded-lg" />
        {/* Direction filter */}
        <Bone className="h-8 w-64 rounded-md" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

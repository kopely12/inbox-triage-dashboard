import { Card, CardContent, CardHeader } from '@/components/ui/card';

function Bone({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className}`} />;
}

function StatCard() {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <Bone className="w-8 h-8 rounded-md shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Bone className="h-3 w-16" />
            <Bone className="h-4 w-10" />
            <Bone className="h-3 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityRow() {
  return (
    <div className="flex items-start gap-3 py-3">
      <Bone className="w-3.5 h-3.5 mt-0.5 shrink-0 rounded-sm" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Bone className="h-4 w-3/4" />
        <Bone className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function OverviewLoading() {
  return (
    <div className="max-w-7xl space-y-6">
      {/* Greeting */}
      <div className="space-y-1.5">
        <Bone className="h-6 w-32" />
        <Bone className="h-3.5 w-44" />
      </div>

      {/* Status row: extension health (2 cols) + open + overdue */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="col-span-2">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <Bone className="w-8 h-8 rounded-md shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-3 w-16" />
                <Bone className="h-4 w-14 rounded-full" />
                <Bone className="h-3 w-36" />
              </div>
            </div>
          </CardContent>
        </Card>
        <StatCard />
        <StatCard />
      </div>

      {/* Quick links */}
      <div className="flex gap-3">
        <Bone className="h-8 w-28 rounded-md" />
        <Bone className="h-8 w-32 rounded-md" />
        <Bone className="h-8 w-24 rounded-md" />
      </div>

      {/* 30-day triage summary */}
      <Card>
        <CardHeader className="pb-2 space-y-1.5">
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-52" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Bone className="h-3 w-16" />
                <Bone className="h-8 w-10" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent commitments */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <Bone className="h-4 w-40" />
            <Bone className="h-3 w-60" />
          </div>
          <Bone className="h-7 w-16 rounded-md" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <ActivityRow key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

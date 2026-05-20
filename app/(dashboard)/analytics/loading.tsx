import { Card, CardContent, CardHeader } from '@/components/ui/card';

function Bone({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-md bg-muted animate-pulse ${className}`} />
  );
}

function ChartCardSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 space-y-1.5">
        <Bone className="h-4 w-32" />
        <Bone className="h-3 w-56" />
      </CardHeader>
      <CardContent>
        <Bone className={tall ? 'h-52 w-full' : 'h-36 w-full'} />
      </CardContent>
    </Card>
  );
}

export default function AnalyticsLoading() {
  return (
    <div className="max-w-7xl space-y-6">
      {/* Header + range toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Bone className="h-6 w-24" />
          <Bone className="h-3.5 w-64" />
        </div>
        <Bone className="h-8 w-52 rounded-lg" />
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <Bone className="w-8 h-8 rounded-md shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-3 w-20" />
                  <Bone className="h-6 w-12" />
                  <Bone className="h-3 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full-width charts */}
      <ChartCardSkeleton tall />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
      <ChartCardSkeleton />
      <ChartCardSkeleton />

      {/* This week vs last */}
      <Card>
        <CardHeader className="pb-2 space-y-1.5">
          <Bone className="h-4 w-40" />
          <Bone className="h-3 w-52" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Bone className="h-3 w-20" />
                <Bone className="h-8 w-10" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side pairs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}

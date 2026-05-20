import { Card, CardContent, CardHeader } from '@/components/ui/card';

function Bone({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className}`} />;
}

function ChartCard({ tall = false }: { tall?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 space-y-1.5">
        <Bone className="h-4 w-32" />
        <Bone className="h-3 w-56" />
      </CardHeader>
      <CardContent>
        <Bone className={tall ? 'h-52 w-full' : 'h-40 w-full'} />
      </CardContent>
    </Card>
  );
}

export default function AnalyticsLoading() {
  return (
    <div className="max-w-4xl space-y-8">
      {/* Header + range toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Bone className="h-6 w-24" />
          <Bone className="h-3.5 w-64" />
        </div>
        <Bone className="h-8 w-52 rounded-lg" />
      </div>
      {/* Insights strip */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[0,1,2].map((i) => <Bone key={i} className="h-14 w-full rounded-md" />)}
      </div>
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0,1,2,3].map((i) => (
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
      {/* Triage section */}
      <div className="space-y-5">
        <Bone className="h-4 w-32" />
        <ChartCard tall />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard />
          <ChartCard />
        </div>
        <ChartCard />
      </div>
      {/* Communication section */}
      <div className="space-y-5">
        <Bone className="h-4 w-32" />
        <ChartCard />
      </div>
      {/* Commitments section */}
      <div className="space-y-5">
        <Bone className="h-4 w-32" />
        <Bone className="h-8 w-52 rounded-lg" />
        <ChartCard tall />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard />
          <ChartCard />
        </div>
      </div>
    </div>
  );
}

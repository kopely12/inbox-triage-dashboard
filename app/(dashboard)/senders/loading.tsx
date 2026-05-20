import { Card, CardContent, CardHeader } from '@/components/ui/card';

function Bone({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className}`} />;
}

export default function SendersLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <Bone className="h-6 w-24" />
        <Bone className="h-4 w-80" />
      </div>
      {/* Stat chips */}
      <div className="flex gap-4">
        {[0,1,2].map((i) => <Bone key={i} className="h-5 w-24 rounded-full" />)}
      </div>
      {/* Table card */}
      <Card>
        <CardHeader className="pb-3 space-y-1.5">
          <Bone className="h-4 w-24" />
          <Bone className="h-3 w-64" />
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Search + filter */}
          <div className="flex gap-3">
            <Bone className="h-8 w-48 rounded-md" />
            <Bone className="h-8 w-32 rounded-full" />
            <Bone className="h-8 w-32 rounded-full" />
          </div>
          {/* Table rows */}
          <div className="rounded-md border border-border overflow-hidden">
            <div className="bg-muted/40 px-3 py-2">
              <Bone className="h-3 w-full" />
            </div>
            {[0,1,2,3,4,5,6,7].map((i) => (
              <div key={i} className="px-3 py-3 border-t border-border flex items-center gap-4">
                <div className="flex items-center gap-2 w-40">
                  <Bone className="w-2 h-2 rounded-full shrink-0" />
                  <Bone className="h-3.5 flex-1" />
                </div>
                <Bone className="h-2 w-24 rounded-full" />
                <Bone className="h-3 w-12" />
                <Bone className="h-3 w-6 ml-auto" />
                <Bone className="h-3 w-6" />
                <Bone className="h-3 w-6" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

export default async function TeamPage() {
  const session = await auth();
  const role = session?.user?.orgRole;
  if (role !== 'admin' && role !== 'owner') redirect('/account');

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="text-sm text-muted-foreground">Manage members and seat assignments.</p>
        </div>
        <Button size="sm" className="gap-1.5" disabled>
          <UserPlus className="w-3.5 h-3.5" />
          Invite member
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Members</CardTitle>
          <CardDescription>Team management coming soon.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Placeholder — team tables will be built in Phase 4 */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1">
              <p className="text-sm font-medium">{session!.user.name ?? session!.user.email}</p>
              <p className="text-xs text-muted-foreground">{session!.user.email}</p>
            </div>
            <Badge variant="outline" className="capitalize">
              {session!.user.orgRole ?? 'member'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function SettingsPage() {
  const session = await auth();
  const role = session?.user?.orgRole;
  if (role !== 'admin' && role !== 'owner') redirect('/account');
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">Organisation-wide configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Organisation settings</CardTitle>
          <CardDescription>Coming soon — org name, domain restrictions, SSO.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This section will be available in a future update.
        </CardContent>
      </Card>
    </div>
  );
}

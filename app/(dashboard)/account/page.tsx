import { auth } from '@/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export default async function AccountPage() {
  const session = await auth();
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', session!.user.id)
    .single();

  const name    = user?.name ?? session!.user.name ?? '—';
  const email   = user?.email ?? session!.user.email ?? '—';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const plan    = user?.plan_tier ?? 'free';
  const joined  = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">Your profile and plan details.</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium">Profile</CardTitle>
          <CardDescription>Synced from your Google account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarImage src={session!.user.image ?? ''} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <Separator />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="mt-0.5">
                <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="capitalize">
                  {plan}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">{joined}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="mt-0.5 font-medium capitalize">{user?.org_role ?? 'member'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Google ID</dt>
              <dd className="mt-0.5 font-mono text-xs text-muted-foreground truncate">{user?.google_id ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

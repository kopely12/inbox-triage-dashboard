import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { acceptInvite } from '@/app/actions/invite';
import { AcceptButton } from '@/components/invite/accept-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Look up invite with org + inviter details
  const { data: invite } = await supabaseAdmin
    .from('org_invites')
    .select('id, email, role, expires_at, accepted_at, org_id, organizations(name), users!invited_by(name, email)')
    .eq('token', token)
    .single();

  // Invalid / already accepted / expired
  const expired  = invite && new Date(invite.expires_at) < new Date();
  const accepted = invite?.accepted_at != null;

  if (!invite || expired || accepted) {
    const reason = !invite
      ? 'This invite link is invalid.'
      : accepted
      ? 'This invite has already been accepted.'
      : 'This invite link has expired.';

    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <CardTitle className="text-base">Invite unavailable</CardTitle>
            </div>
            <CardDescription>{reason}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const orgName     = (invite.organizations as any)?.name ?? 'a team';
  const inviterName = (invite.users as any)?.name ?? (invite.users as any)?.email ?? 'Someone';

  // Check current session
  const session = await auth();

  // Authenticated — try to accept
  if (session?.user) {
    // Email mismatch
    if (session.user.email !== invite.email) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <CardTitle className="text-base">Wrong account</CardTitle>
              </div>
              <CardDescription>
                This invite was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{' '}
                <strong>{session.user.email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptButton token={token} mode="wrong-account" />
            </CardContent>
          </Card>
        </div>
      );
    }

    // Accept the invite
    const result = await acceptInvite(token);

    if (result?.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <CardTitle className="text-base">Something went wrong</CardTitle>
              </div>
              <CardDescription>{result.error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    // Success — redirect to team page
    redirect('/team');
  }

  // Not signed in — show invite preview
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <CardTitle className="text-base">You&apos;re invited</CardTitle>
          </div>
          <CardDescription>
            <span className="font-medium text-foreground">{inviterName}</span> has invited you to
            join <span className="font-medium text-foreground">{orgName}</span> as a{' '}
            <Badge variant="outline" className="capitalize text-xs align-middle">
              {invite.role}
            </Badge>
            .
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sign in using <strong>{invite.email}</strong> to accept this invitation. The link expires on{' '}
            {new Date(invite.expires_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            .
          </p>
          <AcceptButton token={token} mode="sign-in" />
        </CardContent>
      </Card>
    </div>
  );
}

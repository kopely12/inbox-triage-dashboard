import { auth } from '@/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Zap } from 'lucide-react';

export default async function BillingPage() {
  const session = await auth();
  const plan    = session!.user.planTier ?? 'free';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">Manage your plan and payment details.</p>
      </div>

      {/* Current plan */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Current Plan
            <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="capitalize">
              {plan}
            </Badge>
          </CardTitle>
          <CardDescription>
            {plan === 'pro'
              ? 'You have full access to all Inbox Triage features.'
              : 'Upgrade to Pro for unlimited triages and advanced features.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="grid grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Triages / day',   free: '3',        pro: 'Unlimited' },
              { label: 'Emails / triage', free: '20',       pro: '100'       },
              { label: 'AI analyses',     free: '50 / day', pro: '200 / day' },
            ].map(({ label, free, pro }) => (
              <div key={label} className="space-y-1">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="font-medium">{plan === 'pro' ? pro : free}</p>
              </div>
            ))}
          </div>

          {plan !== 'pro' && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Upgrade to Pro</p>
                  <p className="text-xs text-muted-foreground">$12 / month, cancel anytime</p>
                </div>
                <form action="/api/billing/portal" method="POST">
                  <Button type="submit" size="sm" className="gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Upgrade
                  </Button>
                </form>
              </div>
            </>
          )}

          {plan === 'pro' && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Manage subscription</p>
                  <p className="text-xs text-muted-foreground">Update payment method, cancel, or view invoices.</p>
                </div>
                <form action="/api/billing/portal" method="POST">
                  <Button type="submit" variant="outline" size="sm" className="gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Billing portal
                  </Button>
                </form>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

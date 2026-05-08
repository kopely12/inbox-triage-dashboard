'use client';

import { useState } from 'react';
import { createProCheckoutUrl, createPortalUrl } from '@/app/actions/billing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Zap, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';

type Props = {
  plan:             string;
  stripeCustomerId: string | null;
};

export function AccountBillingSection({ plan, stripeCustomerId }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(priceKey: 'pro_monthly' | 'pro_annual') {
    setLoading(priceKey);
    try {
      const result = await createProCheckoutUrl(priceKey);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        window.location.href = result.url;
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading('portal');
    try {
      const result = await createPortalUrl('user');
      if ('error' in result) {
        toast.error(result.error);
      } else {
        window.location.href = result.url;
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  // Team plan: billing is managed on the team page
  if (plan === 'team') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your access is covered by your team plan.{' '}
            <Link href="/team" className="text-foreground underline underline-offset-2">
              View team billing →
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  // Pro plan — show manage billing if Stripe customer exists
  if (plan === 'pro') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Pro plan</p>
              <Badge variant="default" className="text-[10px]">Active</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Manage your subscription, payment method, and invoices.
            </p>
          </div>
          {stripeCustomerId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePortal}
              disabled={loading !== null}
              className="shrink-0 gap-1.5"
            >
              {loading === 'portal'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ExternalLink className="w-3.5 h-3.5" />
              }
              Manage billing
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Free plan — show upgrade options
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          Upgrade to Pro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Unlock unlimited triage sessions, priority processing, and advanced filters.
        </p>
        <div className="flex gap-3">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => handleUpgrade('pro_monthly')}
            disabled={loading !== null}
          >
            {loading === 'pro_monthly' && (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            )}
            $12 / month
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => handleUpgrade('pro_annual')}
            disabled={loading !== null}
          >
            {loading === 'pro_annual' && (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            )}
            $99 / year
            <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">Save 31%</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

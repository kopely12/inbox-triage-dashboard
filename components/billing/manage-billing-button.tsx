'use client';

import { useState } from 'react';
import { createPortalUrl } from '@/app/actions/billing';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={handleClick}
      disabled={loading}
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <ExternalLink className="w-3.5 h-3.5" />}
      Manage billing
    </Button>
  );
}

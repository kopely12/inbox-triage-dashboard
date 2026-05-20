'use client';

import { useTransition } from 'react';
import { toast }  from 'sonner';
import { Pin, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pinSender, suppressSender, clearSenderRule } from '@/app/actions/senders';

export function SenderRuleButtons({
  email,
  domain,
  ruleVal,
}: {
  email:   string | null;
  domain:  string | null;
  ruleVal: string | undefined;
}) {
  const [, startTransition] = useTransition();
  // Use email if available, fall back to domain (domain rules are handled separately)
  const target = email || domain || '';

  function handlePin() {
    if (!target) return;
    startTransition(async () => {
      const res = await pinSender(target);
      if (res.error) toast.error(`Failed to pin: ${res.error}`);
      else toast.success('Sender pinned');
    });
  }

  function handleSuppress() {
    if (!target) return;
    startTransition(async () => {
      const res = await suppressSender(target);
      if (res.error) toast.error(`Failed to suppress: ${res.error}`);
      else toast.success('Sender suppressed');
    });
  }

  function handleClear() {
    if (!target) return;
    startTransition(async () => {
      const res = await clearSenderRule(target);
      if (res.error) toast.error(`Failed to clear rule: ${res.error}`);
      else toast.success('Rule removed');
    });
  }

  if (ruleVal) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClear}
        className="h-7 px-2 text-xs gap-1 text-muted-foreground"
      >
        <X className="w-3 h-3" /> Clear
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePin}
        className="h-7 px-2 text-xs gap-1"
        title="Always surface this sender"
      >
        <Pin className="w-3 h-3" /> Pin
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSuppress}
        className="h-7 px-2 text-xs gap-1 text-muted-foreground"
        title="Never surface this sender"
      >
        <EyeOff className="w-3 h-3" /> Suppress
      </Button>
    </div>
  );
}

export function ClearRuleButton({
  email,
  domain,
}: {
  email:  string | null;
  domain: string | null;
}) {
  const [, startTransition] = useTransition();
  const target = email || domain || '';

  function handleClear() {
    if (!target) return;
    startTransition(async () => {
      const res = await clearSenderRule(target);
      if (res.error) toast.error(`Failed to remove rule: ${res.error}`);
      else toast.success('Rule removed');
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClear}
      className="h-7 px-2 text-xs gap-1 text-muted-foreground"
    >
      <X className="w-3 h-3" /> Remove
    </Button>
  );
}

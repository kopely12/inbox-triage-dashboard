'use client';

import { useTransition, useState } from 'react';
import { updateOrgName } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check } from 'lucide-react';

export function OrgNameForm({ currentName }: { currentName: string }) {
  const [pending, startTransition] = useTransition();
  const [saved,   setSaved]        = useState(false);
  const [error,   setError]        = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateOrgName(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="name">Organization name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={currentName}
          maxLength={60}
          disabled={pending}
          placeholder="Acme Corp"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
        ) : saved ? (
          <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Saved</>
        ) : 'Save'}
      </Button>
    </form>
  );
}

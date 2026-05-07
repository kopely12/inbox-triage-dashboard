'use client';

import { useRef, useState, useTransition } from 'react';
import { updateName } from '@/app/actions/user';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Check, X, Loader2 } from 'lucide-react';

export function EditName({ currentName }: { currentName: string }) {
  const [editing, setEditing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateName(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group">
        <p className="font-medium">{currentName}</p>
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label="Edit name"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          name="name"
          defaultValue={currentName}
          className="h-8 text-sm w-48"
          disabled={pending}
        />
        <Button type="submit" size="icon" variant="ghost" className="w-8 h-8 shrink-0" disabled={pending}>
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-green-600" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="w-8 h-8 shrink-0" onClick={cancel} disabled={pending}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

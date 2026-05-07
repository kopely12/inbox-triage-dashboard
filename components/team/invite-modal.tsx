'use client';

import { useState, useTransition } from 'react';
import { inviteMember } from '@/app/actions/team';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Loader2, UserPlus } from 'lucide-react';

export function InviteModal() {
  const [open, setOpen]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setInviteUrl(null);
    setCopied(false);
  }

  function handleOpen(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.inviteUrl) {
        setInviteUrl(result.inviteUrl);
      }
    });
  }

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="w-3.5 h-3.5" />
        Invite member
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>
              They'll receive a link to join your organization.
            </DialogDescription>
          </DialogHeader>

          {!inviteUrl ? (
            <form action={submit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="colleague@company.com"
                  required
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  name="role"
                  defaultValue="member"
                  disabled={pending}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="member">Member — standard access</option>
                  <option value="admin">Admin — can invite and manage members</option>
                </select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating…</> : 'Generate invite link'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Share this link with your teammate. It expires in 7 days and can only be used once.
              </p>
              <div className="flex items-center gap-2">
                <Input value={inviteUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={copy} className="shrink-0">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset}>Invite another</Button>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

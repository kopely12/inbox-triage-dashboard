'use client';

import { signIn, signOut } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, RefreshCw, LogOut } from 'lucide-react';
import { useState } from 'react';

interface Props {
  email: string;
  name:  string | null;
}

export function GmailConnectionCard({ email, name }: Props) {
  const [reauthorizing, setReauthorizing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleReauthorize() {
    setReauthorizing(true);
    // Sign out then immediately redirect to Google OAuth — forces a fresh token grant
    await signOut({ redirect: false });
    await signIn('google', { callbackUrl: '/preferences' });
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    await signOut({ callbackUrl: '/login' });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-medium">Gmail connection</CardTitle>
        <CardDescription>
          The Google account the extension reads your inbox from.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          {/* Account info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              {name && (
                <p className="text-sm font-medium truncate">{name}</p>
              )}
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
              Connected
            </Badge>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={reauthorizing || disconnecting}
              onClick={handleReauthorize}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reauthorizing ? 'animate-spin' : ''}`} />
              Re-authorize
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={reauthorizing || disconnecting}
              onClick={handleDisconnect}
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Re-authorize if the extension is having trouble accessing your inbox.
          Disconnect signs you out of this device.
        </p>
      </CardContent>
    </Card>
  );
}

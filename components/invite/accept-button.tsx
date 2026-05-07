'use client';

import { signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut } from 'lucide-react';

interface Props {
  token: string;
  mode: 'sign-in' | 'wrong-account';
}

export function AcceptButton({ token, mode }: Props) {
  if (mode === 'wrong-account') {
    return (
      <Button
        variant="outline"
        className="gap-1.5"
        onClick={() => signOut({ callbackUrl: `/invite/${token}` })}
      >
        <LogOut className="w-4 h-4" />
        Sign out and use a different account
      </Button>
    );
  }

  return (
    <Button
      className="gap-1.5 w-full"
      onClick={() => signIn('google', { callbackUrl: `/invite/${token}` })}
    >
      <LogIn className="w-4 h-4" />
      Sign in with Google to accept
    </Button>
  );
}

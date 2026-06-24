'use client';

import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

const TITLES: Record<string, string> = {
  '/':                    'Overview',
  '/account':             'Account',
  '/billing':             'Billing',
  '/team':                'Team',
  '/settings':            'Settings',
  '/preferences':         'Settings',
  '/sender-intelligence': 'Tune',
  '/track':               'Track',
};

export function Header() {
  const pathname = usePathname();
  const title    = TITLES[pathname] ?? 'Dashboard';

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
      <h1 className="text-base font-semibold">{title}</h1>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="text-muted-foreground hover:text-foreground gap-1.5"
      >
        <LogOut className="w-3.5 h-3.5" />
        Sign out
      </Button>
    </header>
  );
}

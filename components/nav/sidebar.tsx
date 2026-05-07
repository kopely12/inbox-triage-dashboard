'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  User,
  CreditCard,
  Users,
  Settings,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const NAV_ITEMS = [
  { href: '/account',  label: 'Account',  icon: User,       adminOnly: false },
  { href: '/billing',  label: 'Billing',  icon: CreditCard,  adminOnly: false },
  { href: '/team',     label: 'Team',     icon: Users,       adminOnly: true  },
  { href: '/settings', label: 'Settings', icon: Settings,    adminOnly: true  },
];

export function Sidebar() {
  const pathname  = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.orgRole === 'admin' || session?.user?.orgRole === 'owner';
  const name    = session?.user?.name ?? session?.user?.email ?? '—';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const plan    = session?.user?.planTier ?? 'free';

  return (
    <aside className="flex flex-col w-60 shrink-0 border-r border-border bg-card h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
          <Mail className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm tracking-tight">Inbox Triage</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, adminOnly }) => {
          if (adminOnly && !isAdmin) return null;
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 pt-2 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar className="w-7 h-7">
            <AvatarImage src={session?.user?.image ?? ''} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground truncate">{session?.user?.email}</span>
          </div>
          <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="ml-auto text-[10px] shrink-0">
            {plan}
          </Badge>
        </div>
      </div>
    </aside>
  );
}

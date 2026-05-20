'use client';

import { useEffect, useState }     from 'react';
import Link                        from 'next/link';
import { usePathname }             from 'next/navigation';
import { useSession, signOut }     from 'next-auth/react';
import { cn }                      from '@/lib/utils';
import {
  CreditCard,
  Users,
  Mail,
  ChevronRight,
  BarChart2,
  LogOut,
  Shield,
  CheckSquare,
  LayoutDashboard,
  SlidersHorizontal,
  Settings2,
} from 'lucide-react';
import { Badge }  from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubItem {
  href:  string; // hash anchor, e.g. '#gmail'
  label: string;
}

interface NavItem {
  href:      string;
  label:     string;
  icon:      React.ComponentType<{ className?: string }>;
  adminOnly: boolean;
  subItems?: SubItem[];
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { href: '/',            label: 'Overview',    icon: LayoutDashboard,   adminOnly: false },
  { href: '/analytics',   label: 'Analytics',   icon: BarChart2,         adminOnly: false },
  { href: '/commitments', label: 'Commitments', icon: CheckSquare,       adminOnly: false },
  { href: '/senders',     label: 'Senders',     icon: SlidersHorizontal, adminOnly: false },
  {
    href: '/preferences', label: 'Preferences', icon: Settings2, adminOnly: false,
    subItems: [
      { href: '#gmail',          label: 'Gmail connection'    },
      { href: '#triage',         label: 'Triage & Scanning'   },
      { href: '#email-scanning', label: 'Email scanning'      },
      { href: '#sender-rules',   label: 'Sender rules'        },
      { href: '#ai-context',     label: 'AI & context'        },
      { href: '#tasks',          label: 'Tasks & commitments' },
      { href: '#interface',      label: 'Interface'           },
      { href: '#time',           label: 'Time & reminders'    },
      { href: '#account',        label: 'Account'             },
    ],
  },
  { href: '/billing', label: 'Billing', icon: CreditCard, adminOnly: false },
  { href: '/team',    label: 'Team',    icon: Users,       adminOnly: true  },
];

// ── useHash hook ──────────────────────────────────────────────────────────────

function useHash(): string {
  const [hash, setHash] = useState('');

  useEffect(() => {
    setHash(window.location.hash);
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return hash;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname             = usePathname();
  const { data: session }    = useSession();
  const hash                 = useHash();

  const isAdmin      = session?.user?.orgRole === 'admin' || session?.user?.orgRole === 'owner';
  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const name         = session?.user?.name ?? session?.user?.email ?? '—';
  const initials     = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const plan         = session?.user?.planTier ?? 'free';

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
        {NAV_ITEMS.map(({ href, label, icon: Icon, adminOnly, subItems }) => {
          if (adminOnly && !isAdmin) return null;

          const active = pathname === href || pathname.startsWith(href + '/');

          return (
            <div key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
              </Link>

              {/* Submenu — visible when parent is active */}
              {active && subItems && (
                <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border pl-3">
                  {subItems.map(({ href: subHref, label: subLabel }) => {
                    const subActive = hash === subHref;
                    return (
                      <a
                        key={subHref}
                        href={subHref}
                        className={cn(
                          'flex items-center px-2 py-1.5 rounded-md text-xs transition-colors',
                          subActive
                            ? 'text-primary font-medium bg-primary/5'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        {subLabel}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Super-admin link — only visible to super-admins */}
        {isSuperAdmin && (
          <>
            <div className="my-1 border-t border-border" />
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === '/admin'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Shield className="w-4 h-4 shrink-0" />
              Admin
              {pathname === '/admin' && <ChevronRight className="w-3 h-3 ml-auto opacity-40" />}
            </Link>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 pt-2 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar className="w-7 h-7">
            <AvatarImage src={session?.user?.image ?? ''} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground truncate">{session?.user?.email}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant={plan === 'pro' ? 'default' : 'secondary'} className="text-[10px]">
              {plan}
            </Badge>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sign out"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

import { SessionProvider } from 'next-auth/react';
import { auth }            from '@/auth';
import { redirect }        from 'next/navigation';
import { after }           from 'next/server';
import { Sidebar }              from '@/components/nav/sidebar';
import { Header }               from '@/components/nav/header';
import { Toaster }              from '@/components/ui/sonner';
import { ImpersonationBanner }  from '@/components/impersonation-banner';
import { AnnouncementBanner }   from '@/components/announcement-banner';
import { supabaseAdmin }        from '@/lib/supabase';
import { getAnnouncement }      from '@/lib/get-announcement';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  // Update last_seen_at after the response is sent — does not block rendering.
  // Skip when a super admin is impersonating so we don't touch the target
  // user's record just because an admin is browsing their account.
  if (!session.user.impersonating) {
    after(async () => {
      await supabaseAdmin
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', session.user.id);
    });
  }

  // Announcement — cached for 60 s, busted immediately when admin saves
  const announcementRow = await getAnnouncement();
  const ann             = announcementRow?.value;
  const activeAnnouncement =
    ann?.active && ann.message
      ? { message: ann.message, type: ann.type, updatedAt: announcementRow!.updated_at }
      : null;

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Global announcement — topmost, shown before impersonation banner */}
          <AnnouncementBanner announcement={activeAnnouncement} />
          <ImpersonationBanner />
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <Toaster />
    </SessionProvider>
  );
}

import { SessionProvider } from 'next-auth/react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/nav/sidebar';
import { Header } from '@/components/nav/header';
import { Toaster } from '@/components/ui/sonner';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <ImpersonationBanner />
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <Toaster />
    </SessionProvider>
  );
}

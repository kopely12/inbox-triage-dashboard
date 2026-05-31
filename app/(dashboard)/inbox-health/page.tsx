import { auth }           from '@/auth';
import { redirect }        from 'next/navigation';
import { getInboxHealth }  from '@/app/actions/engagement';
import { InboxHealthClient } from '@/components/inbox-health/inbox-health-client';

export const metadata = { title: 'Inbox Health — Inbox Triage' };

export default async function InboxHealthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { health } = await getInboxHealth();

  return <InboxHealthClient health={health} />;
}

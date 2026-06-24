import { redirect } from 'next/navigation';

export const metadata = { title: 'Billing — Inbox Triage' };

export default function BillingPage() {
  redirect('/preferences');
}

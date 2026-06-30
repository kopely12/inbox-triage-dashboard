import { redirect } from 'next/navigation';

export const metadata = { title: 'Billing — iinbox' };

export default function BillingPage() {
  redirect('/preferences');
}

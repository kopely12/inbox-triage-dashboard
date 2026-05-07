import { redirect } from 'next/navigation';

// Settings has been merged into the Account page.
export default function SettingsPage() {
  redirect('/account');
}

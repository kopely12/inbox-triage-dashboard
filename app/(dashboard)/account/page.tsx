import { redirect } from 'next/navigation';

// /account has been consolidated into /preferences
export default function AccountPage() {
  redirect('/preferences');
}

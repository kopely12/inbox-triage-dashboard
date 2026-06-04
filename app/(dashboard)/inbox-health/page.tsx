// /inbox-health is now the home page — redirect to keep any bookmarked links working.
import { redirect } from 'next/navigation';

export default function InboxHealthRedirect() {
  redirect('/');
}

// Contacts view has moved into Inbox Cleaner — redirect to keep old links working.
import { redirect } from 'next/navigation';

export default function SendersRedirect() {
  redirect('/sender-intelligence');
}

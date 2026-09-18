import { redirect } from 'next/navigation';
import { publicAccessEnabled } from '../../lib/access';
import LogoutForm from './logout-form';
export const dynamic = 'force-dynamic';
export default function Logout() {
  if (publicAccessEnabled()) redirect('/');
  return <LogoutForm />;
}

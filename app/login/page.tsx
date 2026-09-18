import { redirect } from 'next/navigation';
import { publicAccessEnabled } from '../../lib/access';
import LoginForm from './login-form';
export const dynamic = 'force-dynamic';
export default function Login() {
  if (publicAccessEnabled()) redirect('/');
  return <LoginForm />;
}

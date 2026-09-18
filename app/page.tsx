export const dynamic = 'force-dynamic';
import Dashboard from './fleet-dashboard';
import { publicAccessEnabled } from '../lib/access';
export default function Page() {
  return <Dashboard publicAccess={publicAccessEnabled()} />;
}

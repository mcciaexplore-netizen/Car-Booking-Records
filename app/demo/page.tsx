export const dynamic = 'force-dynamic';
import Dashboard from '../dashboard';
import { requireChatGPTUser } from '../chatgpt-auth';
import { readAccess } from '../../lib/server';
import { publicAccessEnabled } from '../../lib/access';
export default async function Demo() {
  if (!publicAccessEnabled()) await requireChatGPTUser('/demo');
  await readAccess();
  return <Dashboard />;
}

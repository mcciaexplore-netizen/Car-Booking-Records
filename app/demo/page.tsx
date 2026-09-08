export const dynamic = 'force-dynamic';
import Dashboard from '../dashboard';
import { requireChatGPTUser } from '../chatgpt-auth';
import { member } from '../../lib/server';
export default async function Demo() {
  await requireChatGPTUser('/demo');
  await member();
  return <Dashboard />;
}

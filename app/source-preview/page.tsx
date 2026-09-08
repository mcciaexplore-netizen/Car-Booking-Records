import { requireChatGPTUser } from '../chatgpt-auth';
import { member } from '../../lib/server';
import input from '../../lib/sample-records.json';
import SampleDashboard from '../sample-dashboard';
import type { SampleInput } from '../../lib/reconcile';
import '../reconciliation.css';
export const dynamic = 'force-dynamic';
export default async function SourcePreview() {
  await requireChatGPTUser('/source-preview');
  await member();
  return (
    <>
      <div
        className="notice"
        style={{ margin: 0, borderRadius: 0, padding: '14px 24px' }}
      >
        <a href="/">← Back to Fleet Desk</a> · Historical supplied-file preview.
        These records are separate from confirmed operational totals.
      </div>
      <SampleDashboard input={input as unknown as SampleInput} />
    </>
  );
}

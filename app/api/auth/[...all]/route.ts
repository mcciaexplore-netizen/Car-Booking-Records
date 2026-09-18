import { authConfigured, fleetAuth } from '../../../../lib/auth';
import { publicAccessEnabled } from '../../../../lib/access';
export const dynamic = 'force-dynamic';
async function handler(request: Request) {
  if (publicAccessEnabled())
    return Response.json(
      { message: 'Accounts are disabled for this public dashboard.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  if (!authConfigured())
    return Response.json(
      { message: 'Sign-in setup is incomplete. Contact the administrator.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    return await fleetAuth().handler(request);
  } catch {
    return Response.json(
      { message: 'Sign-in is unavailable. Please try again later.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const GET = handler;
export const POST = handler;

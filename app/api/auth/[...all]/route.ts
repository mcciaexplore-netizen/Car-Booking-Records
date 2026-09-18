import { authConfigured, fleetAuth } from '../../../../lib/auth';
export const dynamic = 'force-dynamic';
async function handler(request: Request) {
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

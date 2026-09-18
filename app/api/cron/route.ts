import { POST as scheduled } from '../fleet/[...path]/route';
import { cleanupStaging } from '../../../lib/upload-intents';
import { handle, HttpError, hash, runtime } from '../../../lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const secret = runtime().SCHEDULER_SECRET;
    if (
      !secret ||
      (await hash(request.headers.get('authorization') ?? '')) !==
        (await hash(`Bearer ${secret}`))
    )
      throw new HttpError(401, 'Invalid scheduler authentication.');
    await cleanupStaging();
    return scheduled(
      new Request(new URL('/api/fleet/scheduled', request.url), {
        method: 'POST',
        headers: request.headers,
      }),
    );
  });
}

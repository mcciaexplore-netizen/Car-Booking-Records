import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import {
  body,
  handle,
  json,
  member,
  sameOrigin,
  HttpError,
} from '../../../lib/server';
import {
  prepareUpload,
  claimUploadToken,
  finalizeUpload,
} from '../../../lib/upload-intents';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handle(async () => {
    const input = await body(request);
    if (
      input.type === 'blob.upload-completed' ||
      input.type === 'blob.generate-client-token'
    ) {
      const result = await handleUpload({
        request,
        body: input as HandleUploadBody,
        onBeforeGenerateToken: async (pathname) => {
          sameOrigin(request);
          const user = await member([
            'Administrator',
            'Manager',
            'Register operator',
          ]);
          return claimUploadToken(pathname, user.email);
        },
        // The SDK verifies the webhook signature. Only an authenticated finalize
        // request can create document records; webhooks cannot approve anything.
        onUploadCompleted: async () => {},
      });
      return json(result);
    }
    sameOrigin(request);
    const user = await member([
      'Administrator',
      'Manager',
      'Register operator',
    ]);
    if (input.action === 'prepare')
      return json(await prepareUpload(input, user.email));
    if (input.action === 'finalize' && typeof input.intentId === 'string')
      return json(await finalizeUpload(input.intentId, user.email));
    throw new HttpError(400, 'Unknown upload action.');
  });
}

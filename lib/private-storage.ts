import { put, get, del } from '@vercel/blob';
import type { DocumentStore } from './platform-types';
export const privateDocuments: DocumentStore = {
  async put(key, data, options) {
    return put(key, typeof data === 'string' ? data : Buffer.from(data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: options?.httpMetadata?.contentType ?? 'application/json',
      cacheControlMaxAge: 60,
    });
  },
  async get(key) {
    const result = await get(key, { access: 'private', useCache: false });
    return result?.statusCode === 200 ? { body: result.stream } : null;
  },
  async delete(key) {
    await del(key);
  },
};

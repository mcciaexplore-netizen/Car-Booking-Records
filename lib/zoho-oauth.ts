import { HttpError, type Runtime } from './server';

export const ZOHO_REGIONS: Record<string, string> = {
  US: 'com',
  IN: 'in',
  EU: 'eu',
  AU: 'com.au',
  JP: 'jp',
  CA: 'ca',
  SA: 'sa',
  CN: 'com.cn',
  UAE: 'ae',
};
type Credentials = Pick<
  Runtime,
  'ZOHO_CLIENT_ID' | 'ZOHO_CLIENT_SECRET' | 'ZOHO_REFRESH_TOKEN' | 'ZOHO_DC'
>;
type Access = { access: string; domain: string; expiresAt: number };
export const oauthConfigured = (e: Credentials) =>
  !!(
    e.ZOHO_CLIENT_ID &&
    e.ZOHO_CLIENT_SECRET &&
    e.ZOHO_REFRESH_TOKEN &&
    ZOHO_REGIONS[e.ZOHO_DC ?? '']
  );

// One cached value per Worker isolate, never a cross-request I/O promise.
// Credentials and tokens stay in server memory; no database or browser storage.
export function createTokenManager(clock = () => Date.now()) {
  let cached: (Access & { identity: string }) | undefined;
  let failed: { identity: string; until: number; error: HttpError } | undefined;
  const identity = (e: Credentials) =>
    JSON.stringify([
      e.ZOHO_DC,
      e.ZOHO_CLIENT_ID,
      e.ZOHO_CLIENT_SECRET,
      e.ZOHO_REFRESH_TOKEN,
    ]);
  return {
    invalidate(access: string) {
      if (cached?.access === access) cached = undefined;
    },
    status(e: Credentials) {
      const current = cached?.identity === identity(e) ? cached : undefined;
      return {
        configured: oauthConfigured(e),
        automaticRenewal: oauthConfigured(e),
        verified: !!current && current.expiresAt > clock(),
        expiresAt: current ? new Date(current.expiresAt).toISOString() : null,
      };
    },
    async get(e: Credentials): Promise<Access> {
      if (!oauthConfigured(e))
        throw new HttpError(
          503,
          'Add the saved Zoho credentials to the server first.',
        );
      const key = identity(e);
      if (cached?.identity === key && cached.expiresAt > clock() + 60000)
        return {
          access: cached.access,
          domain: cached.domain,
          expiresAt: cached.expiresAt,
        };
      if (failed?.identity === key && failed.until > clock())
        throw failed.error;
      cached = undefined;
      const suffix = ZOHO_REGIONS[e.ZOHO_DC!];
      const domain = `https://www.zohoapis.${suffix}`;
      const startedAt = clock();
      try {
        const response = await fetch(
          `https://accounts.zoho.${suffix}/oauth/v2/token`,
          {
            method: 'POST',
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: e.ZOHO_CLIENT_ID!,
              client_secret: e.ZOHO_CLIENT_SECRET!,
              refresh_token: e.ZOHO_REFRESH_TOKEN!,
            }),
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(20000),
          },
        );
        if (response.status === 429)
          throw new HttpError(
            429,
            'Zoho token limit reached. Renewal will be available again in ten minutes.',
          );
        const data = (await response.json()) as Record<string, unknown>;
        if (['invalid_code', 'invalid_grant'].includes(String(data?.error)))
          throw new HttpError(
            502,
            'Zoho authorization is no longer valid. Reconnect the account once.',
          );
        if (
          !response.ok ||
          !data ||
          typeof data.access_token !== 'string' ||
          !/^[A-Za-z0-9._-]{1,4096}$/.test(data.access_token)
        )
          throw new HttpError(
            502,
            'Zoho access renewal failed. Check the account credentials and region.',
          );
        if (data.api_domain !== domain)
          throw new HttpError(
            502,
            'Zoho returned a different data centre. Check the configured region.',
          );
        const seconds = Number(data.expires_in);
        if (!Number.isFinite(seconds) || seconds <= 60 || seconds > 86400)
          throw new HttpError(
            502,
            'Zoho returned an invalid token lifetime. No token was retained.',
          );
        cached = {
          identity: key,
          access: data.access_token,
          domain,
          expiresAt: startedAt + seconds * 1000,
        };
        failed = undefined;
        return { access: cached.access, domain, expiresAt: cached.expiresAt };
      } catch (cause) {
        const error =
          cause instanceof HttpError
            ? cause
            : new HttpError(
                502,
                'Zoho access renewal could not complete. Try again in one minute.',
              );
        failed = {
          identity: key,
          until: clock() + (error.status === 429 ? 600000 : 60000),
          error,
        };
        throw error;
      }
    },
  };
}

// Optional standalone Cloudflare Worker. Deploy only after confirming API allowance.
// Requires a PRIVATE service binding to the Fleet Desk worker in your own account.
// An unauthenticated HTTP request cannot pass the private Sites sign-in gateway.
type Env = { FLEET_SERVICE: Fetcher; SCHEDULER_SECRET: string };
export default {
  async scheduled(
    _event: unknown,
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    ctx.waitUntil(
      (async () => {
        if (!env.FLEET_SERVICE)
          throw Error('Private Fleet Desk service binding is not configured');
        const response = await env.FLEET_SERVICE.fetch(
          'https://fleet.internal/api/fleet/scheduled',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.SCHEDULER_SECRET}` },
            signal: AbortSignal.timeout(60000),
          },
        );
        if (!response.ok)
          throw Error(`Fleet scheduler returned HTTP ${response.status}`);
      })(),
    );
  },
};

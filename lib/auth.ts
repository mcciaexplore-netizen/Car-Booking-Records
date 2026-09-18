import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/libsql';
import { createHash, timingSafeEqual } from 'node:crypto';
import { databaseClient } from './database';
import * as schema from '../db/auth-schema';

export function authConfigured() {
  return !!(
    process.env.TURSO_DATABASE_URL &&
    process.env.BETTER_AUTH_URL &&
    (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32
  );
}
const digest = (value: string) => createHash('sha256').update(value).digest();
export async function consumeInvitation(email: string, code: string) {
  const client = databaseClient();
  if (!code || code.length > 256) return false;
  const stamp = new Date().toISOString();
  const bootstrap = process.env.FLEET_BOOTSTRAP_TOKEN;
  if (
    bootstrap &&
    bootstrap.length >= 32 &&
    email === process.env.FLEET_ADMIN_EMAIL?.toLowerCase() &&
    timingSafeEqual(digest(code), digest(bootstrap))
  ) {
    const result = await client.execute({
      sql: "INSERT OR IGNORE INTO settings(key,value) SELECT 'authBootstrapUsed',? WHERE NOT EXISTS(SELECT 1 FROM auth_user)",
      args: [JSON.stringify(stamp)],
    });
    return result.rowsAffected === 1;
  }
  const result = await client.execute({
    sql: `UPDATE staff_invitations SET consumedAt=? WHERE email=? AND tokenHash=? AND consumedAt IS NULL AND expiresAt>?
      AND EXISTS(SELECT 1 FROM users WHERE email=? AND active=1)`,
    args: [stamp, email, digest(code).toString('hex'), stamp, email],
  });
  return result.rowsAffected === 1;
}

function createFleetAuth() {
  if (!authConfigured())
    throw new Error('Car Booking Details sign-in is not configured.');
  const baseURL = process.env.BETTER_AUTH_URL!;
  if (process.env.VERCEL && new URL(baseURL).protocol !== 'https:')
    throw new Error('HTTPS is required.');
  return betterAuth({
    appName: 'Car Booking Details',
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(baseURL).origin],
    database: drizzleAdapter(drizzle(databaseClient()), {
      provider: 'sqlite',
      schema,
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: new URL(baseURL).protocol === 'https:',
      ipAddress: {
        ipAddressHeaders: process.env.VERCEL
          ? ['x-vercel-forwarded-for']
          : ['x-forwarded-for'],
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return;
        const email = String(ctx.body?.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(ctx.body?.password ?? '');
        const name = String(ctx.body?.name ?? '').trim();
        if (
          !name ||
          name.length > 100 ||
          !/^\S+@\S+\.\S+$/.test(email) ||
          password.length < 12 ||
          password.length > 128
        )
          throw new APIError('BAD_REQUEST', {
            message: 'Enter a valid email and a password of 12–128 characters.',
          });
        const code = ctx.headers?.get('x-fleet-invitation') ?? '';
        if (!(await consumeInvitation(email, code)))
          throw new APIError('FORBIDDEN', {
            message: 'A valid, unused invitation for this email is required.',
          });
      }),
    },
    // No provider emails, reset emails or notification delivery is configured.
    logger: { disabled: true },
  });
}
let instance: ReturnType<typeof createFleetAuth> | undefined;
export function fleetAuth() {
  return (instance ??= createFleetAuth());
}

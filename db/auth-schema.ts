import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp_ms' }).notNull();
export const user = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
});
export const session = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt'),
    token: text('token').notNull().unique(),
    createdAt: timestamp('createdAt'),
    updatedAt: timestamp('updatedAt'),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('auth_session_user').on(table.userId)],
);
export const account = sqliteTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: integer('accessTokenExpiresAt', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt'),
    updatedAt: timestamp('updatedAt'),
  },
  (table) => [index('auth_account_user').on(table.userId)],
);
export const verification = sqliteTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt'),
    createdAt: timestamp('createdAt'),
    updatedAt: timestamp('updatedAt'),
  },
  (table) => [index('auth_verification_identifier').on(table.identifier)],
);
export const rateLimit = sqliteTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('lastRequest').notNull(),
});

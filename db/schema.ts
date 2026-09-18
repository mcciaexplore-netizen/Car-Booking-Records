import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  role: text().notNull(),
  active: integer().notNull().default(1),
  createdAt: text().notNull(),
});
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
});
export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: text().primaryKey(),
    status: text().notNull(),
    mode: text().notNull(),
    startedAt: text().notNull(),
    finishedAt: text(),
    reportIndex: integer().notNull().default(0),
    cursor: text(),
    pages: integer().notNull().default(0),
    count: integer().notNull().default(0),
    error: text(),
    attempts: integer().notNull().default(0),
    retryAt: text(),
    leaseUntil: text(),
    mappingHash: text().notNull(),
  },
  () => [
    uniqueIndex('one_active_sync')
      .on(sql`(1)`)
      .where(sql`status IN ('syncing','retrying')`),
  ],
);
// A complete generation is activated atomically. Partial imports are never dashboard data.
export const sourceRecords = sqliteTable(
  'source_records',
  {
    generation: text()
      .notNull()
      .references(() => syncRuns.id),
    kind: text().notNull(),
    id: text().notNull(),
    report: text().notNull(),
    sourceId: text().notNull(),
    raw: text().notNull(),
    data: text().notNull(),
    fetchedAt: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.generation, t.kind, t.id] }),
    index('source_generation').on(t.generation, t.kind),
  ],
);
export const documents = sqliteTable('documents', {
  id: text().primaryKey(),
  sha256: text().notNull().unique(),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  objectKey: text().notNull(),
  kind: text().notNull(),
  status: text().notNull(),
  uploadedBy: text().notNull(),
  createdAt: text().notNull(),
  operation: text(),
  extractionKey: text(),
  error: text(),
  deletedAt: text(),
});
export const extractedRows = sqliteTable(
  'extracted_rows',
  {
    id: text().primaryKey(),
    documentId: text()
      .notNull()
      .references(() => documents.id),
    page: integer().notNull(),
    row: integer().notNull(),
    original: text().notNull(),
    corrected: text().notNull(),
    flags: text().notNull(),
    state: text().notNull(),
    version: integer().notNull().default(1),
    reviewer: text(),
    reviewedAt: text(),
    createdAt: text().notNull(),
  },
  (t) => [index('row_document').on(t.documentId)],
);
export const actualTrips = sqliteTable('actual_trips', {
  id: text().primaryKey(),
  rowId: text()
    .notNull()
    .unique()
    .references(() => extractedRows.id),
  data: text().notNull(),
  updatedAt: text().notNull(),
});
export const fuelPurchases = sqliteTable('fuel_purchases', {
  id: text().primaryKey(),
  rowId: text()
    .notNull()
    .unique()
    .references(() => extractedRows.id),
  data: text().notNull(),
  updatedAt: text().notNull(),
});
export const reconciliations = sqliteTable(
  'reconciliations',
  {
    id: text().primaryKey(),
    tripId: text().notNull(),
    inputHash: text().notNull(),
    ruleVersion: text().notNull(),
    result: text().notNull(),
    createdAt: text().notNull(),
  },
  (t) => [index('reconciliation_trip').on(t.tripId)],
);
export const decisions = sqliteTable('review_decisions', {
  id: text().primaryKey(),
  tripId: text().notNull(),
  action: text().notNull(),
  bookingId: text(),
  duplicateOf: text(),
  reason: text().notNull(),
  reviewer: text().notNull(),
  createdAt: text().notNull(),
  evidenceHash: text().notNull(),
  originalResult: text().notNull(),
});
export const history = sqliteTable('change_history', {
  id: text().primaryKey(),
  entityId: text().notNull(),
  action: text().notNull(),
  actor: text().notNull(),
  before: text(),
  after: text(),
  createdAt: text().notNull(),
});
export const alerts = sqliteTable('alerts', {
  id: text().primaryKey(),
  kind: text().notNull(),
  entityId: text().notNull(),
  message: text().notNull(),
  state: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});
export const oauthStates = sqliteTable('oauth_states', {
  id: text().primaryKey(),
  userId: text().notNull(),
  expiresAt: text().notNull(),
});
export const apiBudget = sqliteTable('api_budget', {
  day: text().primaryKey(),
  calls: integer().notNull().default(0),
});
export {
  user as authUser,
  session as authSession,
  account as authAccount,
  verification as authVerification,
  rateLimit as authRateLimit,
} from './auth-schema';
export const staffInvitations = sqliteTable(
  'staff_invitations',
  {
    id: text().primaryKey(),
    email: text().notNull(),
    tokenHash: text().notNull().unique(),
    createdBy: text().notNull(),
    createdAt: text().notNull(),
    expiresAt: text().notNull(),
    consumedAt: text(),
  },
  (table) => [index('staff_invitation_email').on(table.email)],
);
export const uploadIntents = sqliteTable(
  'upload_intents',
  {
    id: text().primaryKey(),
    actor: text().notNull(),
    name: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    kind: text().notNull(),
    objectKey: text().notNull().unique(),
    createdAt: text().notNull(),
    expiresAt: text().notNull(),
    tokenIssuedAt: text(),
    result: text(),
  },
  (table) => [index('upload_intent_actor').on(table.actor, table.createdAt)],
);

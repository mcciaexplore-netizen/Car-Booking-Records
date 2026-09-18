import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

if (!process.env.TURSO_DATABASE_URL)
  throw new Error(
    'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the server environment.',
  );
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS fleet_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, appliedAt TEXT NOT NULL)',
  );
  for (const name of (await readdir('drizzle'))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = (await readFile('drizzle/' + name, 'utf8')).replace(
      /\r\n/g,
      '\n',
    );
    const checksum = createHash('sha256').update(sql).digest('hex');
    const tx = await client.transaction('write');
    try {
      const previous = await tx.execute({
        sql: 'SELECT checksum FROM fleet_migrations WHERE name=?',
        args: [name],
      });
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error('Previously applied migration changed: ' + name);
      } else {
        await tx.executeMultiple(sql);
        await tx.execute({
          sql: 'INSERT INTO fleet_migrations VALUES(?,?,?)',
          args: [name, checksum, new Date().toISOString()],
        });
      }
      await tx.commit();
      console.log('Verified migration: ' + name);
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
} finally {
  client.close();
}

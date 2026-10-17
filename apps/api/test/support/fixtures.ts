import type { SQL } from 'drizzle-orm';
import { user } from '../../src/db/auth-schema.js';
import type { Db } from '../../src/db/db.module.js';

export async function insertUser(
  db: Db,
  email = 'ada@example.com',
): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Ada', email, emailVerified: true })
    .returning({ id: user.id });
  return row!.id;
}

/** Insert values where a column can also take SQL, for example now() - interval '1 second'. */
export type SqlValues<T> = { [K in keyof T]?: T[K] | SQL };

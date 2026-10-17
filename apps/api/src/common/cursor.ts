import type { Page } from '@minstrel/shared';
import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { isUuid } from './is-uuid.js';

// Spec §9 cursor pages, newest first. The cursor carries the exact created_at and the ID of the last
// row of a page. It does not need that row, so a deleted row does not end the list.
interface Cursor {
  createdAt: string;
  id: string;
}

// UTC with microseconds, the full precision of a Postgres timestamp.
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const invalidCursor = () =>
  new ApiError(400, 'invalid_input', 'This page link is not valid.', { cursor: 'Not valid.' });

export function decodeCursor(value: string): Cursor {
  const [createdAt, id, extra] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  if (extra !== undefined || !createdAt || !TIME.test(createdAt) || !id || !isUuid(id)) {
    throw invalidCursor();
  }
  return { createdAt, id };
}

/** Select this next to the row. The text keeps the microseconds that a JS Date loses. */
export const cursorTime = (createdAt: AnyColumn) =>
  sql<string>`to_char(${createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** The rows after the cursor, in (created_at DESC, id DESC) order. */
export const afterCursor = (createdAt: AnyColumn, id: AnyColumn, cursor: Cursor): SQL =>
  sql`(${createdAt}, ${id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`;

/** `rows` holds one row more than `limit`, so the page knows if a next page exists. */
export function toPage<R extends { id: string }, T>(
  rows: Array<{ row: R; cursorTime: string }>,
  limit: number,
  map: (row: R) => T,
): Page<T> {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => map(r.row)),
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(`${last.cursorTime}|${last.row.id}`).toString('base64url')
        : null,
  };
}

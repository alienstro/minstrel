import { z } from 'zod';

const uuid = z.uuid();

/** A route checks an ID before the query, so a bad ID gives 404 and never a database error. */
export const isUuid = (value: string): boolean => uuid.safeParse(value).success;

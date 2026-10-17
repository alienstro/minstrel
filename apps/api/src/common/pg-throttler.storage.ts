import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/db.module.js';
import { CLIENT_IP_HEADER } from './client-ip.js';

// Spec §4.5 and §7.4. Many function instances run at the same time, so the count lives in Postgres.
// One upsert counts the hit and starts a new window when reset_at has passed. Postgres now() is the clock.
export class PgThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly db: Db) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
  ): Promise<ThrottlerStorageRecord> {
    const window = `${ttl} milliseconds`;
    const { rows } = await this.db.execute<{
      hits: number;
      seconds_left: number;
    }>(sql`
      INSERT INTO rate_limits (key, hits, reset_at)
      VALUES (${key}, 1, now() + ${window}::interval)
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + ${window}::interval
                        ELSE rate_limits.reset_at END
      RETURNING hits, ceil(extract(epoch FROM reset_at - now()))::int AS seconds_left`);
    const { hits, seconds_left } = rows[0]!;
    const isBlocked = hits > limit;
    return {
      totalHits: hits,
      timeToExpire: seconds_left,
      isBlocked,
      timeToBlockExpire: isBlocked ? seconds_left : 0,
    };
  }
}

// Use with @UseGuards(UserThrottlerGuard) and @Throttle(...) on a route. It runs after the session guard,
// so the tracker is the user ID. A route without a session falls back to the client IP from Cloudflare.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const userId: string | undefined = req.user?.id;
    if (userId) return `user:${userId}`;
    const clientIp = req.headers?.[CLIENT_IP_HEADER];
    return `ip:${typeof clientIp === 'string' ? clientIp : req.ip}`;
  }
}

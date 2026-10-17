import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export type Db = NodePgDatabase;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Db => drizzle({ client: pool }),
    },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

import { defineConfig } from 'drizzle-kit';

// Migrations use the direct connection. The Neon pooled connection does not suit DDL (spec §2.4).
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});

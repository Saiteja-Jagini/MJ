import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { databaseConnectionString } from './connection';
const g = globalThis as unknown as { juryPool?: Pool };
export const pool =
  g.juryPool ??
  new Pool({
    connectionString: databaseConnectionString || undefined,
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
if (process.env.NODE_ENV !== 'production') g.juryPool = pool;
export const db = drizzle(pool, { schema });

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('database connection selection', () => {
  it('uses a hosted integration URL instead of a stale localhost URL on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('DATABASE_URL', 'postgresql://local:secret@localhost:15432/moleculejury');
    vi.stubEnv('POSTGRES_URL', 'postgresql://hosted:secret@db.example.com/moleculejury');
    vi.resetModules();
    const connection = await import('../lib/db/connection');
    expect(connection.databaseConnectionString).toBe('postgresql://hosted:secret@db.example.com/moleculejury');
    expect(connection.databaseLocalOnly).toBe(false);
  });

  it('flags a local-only URL on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('DATABASE_URL', 'postgresql://local:secret@127.0.0.1:15432/moleculejury');
    vi.stubEnv('POSTGRES_URL', '');
    vi.resetModules();
    const connection = await import('../lib/db/connection');
    expect(connection.databaseConnectionString).toBe('');
    expect(connection.databaseLocalOnly).toBe(true);
  });
});

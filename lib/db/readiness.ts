import { AppError } from '../http';
import { databaseConnectionString, databaseLocalOnly } from './connection';
import { pool } from './index';

export type DatabaseStatus = 'ready' | 'not_configured' | 'local_only' | 'unreachable' | 'schema_missing';

export async function databaseStatus(): Promise<DatabaseStatus> {
  if (!databaseConnectionString) return databaseLocalOnly ? 'local_only' : 'not_configured';
  try {
    const result = await pool.query(
      "SELECT to_regclass('analysis_runs') AS runs, to_regclass('resolved_subjects') AS subjects",
    );
    return result.rows[0]?.runs && result.rows[0]?.subjects ? 'ready' : 'schema_missing';
  } catch {
    return 'unreachable';
  }
}

export async function requireDatabaseReady() {
  const status = await databaseStatus();
  if (status === 'ready') return;
  const messages: Record<Exclude<DatabaseStatus, 'ready'>, string> = {
    not_configured: 'Connect hosted PostgreSQL to this deployment before starting an analysis.',
    local_only: 'This deployment has a localhost database URL. Connect hosted PostgreSQL instead.',
    unreachable: 'The hosted PostgreSQL database is unreachable. Check its Production connection settings.',
    schema_missing: 'PostgreSQL is connected, but its tables are missing. Run the database migrations.',
  };
  throw new AppError(messages[status], 503);
}

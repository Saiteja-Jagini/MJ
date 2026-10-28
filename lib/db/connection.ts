// Marketplace Postgres integrations may expose either name. A Vercel function
// cannot reach the developer's localhost database.
const candidates = [process.env.DATABASE_URL, process.env.POSTGRES_URL]
  .map((value) => value?.trim() ?? '')
  .filter(Boolean);

function isLoopback(url: string) {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const databaseConnectionString = process.env.VERCEL
  ? candidates.find((value) => !isLoopback(value)) ?? ''
  : candidates[0] ?? '';
export const databaseLocalOnly = Boolean(process.env.VERCEL && candidates.length && !databaseConnectionString);

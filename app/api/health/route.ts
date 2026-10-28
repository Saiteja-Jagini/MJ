import { NextResponse } from 'next/server';
import { databaseStatus } from '@/lib/db/readiness';
import { loadBrain } from '@/lib/brain-server';
export async function GET() {
  const [db, brain] = await Promise.allSettled([databaseStatus(), loadBrain()]);
  const status = db.status === 'fulfilled' ? db.value : 'unreachable';
  return NextResponse.json(
    {
      database: status === 'ready',
      databaseStatus: status,
      ai: !!process.env.OPENAI_API_KEY,
      brain: brain.status === 'fulfilled' && brain.value !== null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

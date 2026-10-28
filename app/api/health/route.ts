import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { loadBrain } from '@/lib/brain-server';
export async function GET() {
  const [db, brain] = await Promise.allSettled([pool.query('SELECT 1'), loadBrain()]);
  return NextResponse.json(
    {
      database: db.status === 'fulfilled',
      ai: !!process.env.OPENAI_API_KEY,
      brain: brain.status === 'fulfilled' && brain.value !== null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

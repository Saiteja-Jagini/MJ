import { NextResponse } from 'next/server';
import { listRuns } from '@/lib/db/repository';
import { sessionId } from '@/lib/session';
import { apiError } from '@/lib/http';
export async function GET() {
  try {
    return NextResponse.json(
      { runs: await listRuns(await sessionId()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}

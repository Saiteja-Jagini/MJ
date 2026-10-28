import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRun } from '@/lib/db/repository';
import { sessionId } from '@/lib/session';
import { apiError } from '@/lib/http';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const r = await getRun(id, await sessionId());
    return NextResponse.json(
      { runId: r.id, dossier: r.dossier, turns: r.turns, verdict: r.verdict, status: r.status },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}

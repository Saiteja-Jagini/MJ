import { NextResponse } from 'next/server';
import { ResolveInputSchema, resolveInput } from '@/lib/resolve';
import { readJson, apiError } from '@/lib/http';
import { saveResolvedSubjects } from '@/lib/db/repository';
import { sessionId } from '@/lib/session';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const session = await sessionId();
    const result = await resolveInput(ResolveInputSchema.parse(await readJson(req)));
    await saveResolvedSubjects(result.candidates, session);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}

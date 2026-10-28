import { NextResponse } from 'next/server';
import { SubjectSchema } from '@/lib/types';
import { buildDossier } from '@/lib/evidence';
import { saveDossier, getResolvedSubject } from '@/lib/db/repository';
import { sessionId } from '@/lib/session';
import { readJson, apiError, AppError } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: Request) {
  try {
    const input = SubjectSchema.parse(await readJson(req));
    const session = await sessionId();
    const subject = await getResolvedSubject(input.id, session);
    const dossier = await buildDossier(subject);
    let runId: string;
    try {
      runId = await saveDossier(dossier, session);
    } catch {
      throw new AppError(
        'The dossier is ready, but PostgreSQL is unavailable. Start the database and retry; the jury has not been charged.',
        503,
      );
    }
    return NextResponse.json({ runId, dossier });
  } catch (e) {
    return apiError(e);
  }
}

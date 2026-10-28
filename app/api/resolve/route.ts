import { NextResponse } from 'next/server';
import { ResolveInputSchema, resolveInput } from '@/lib/resolve';
import { readJson, apiError } from '@/lib/http';
import { getRun, saveResolvedSubjects } from '@/lib/db/repository';
import { sessionId } from '@/lib/session';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const session = await sessionId();
    const input = ResolveInputSchema.parse(await readJson(req));
    const result = await resolveInput(input);
    if (input.referenceRunIds?.length) {
      const references = await Promise.all(
        [...new Set(input.referenceRunIds)].map(async (id) => {
          const run = await getRun(id, session);
          return {
            id,
            title: run.title,
            question: run.dossier.subject.question,
            call: run.verdict?.call ?? null,
            headline: (run.verdict?.headline ?? '').slice(0, 1000),
            reasons: (run.verdict?.reasons ?? []).slice(0, 3).map((x) => x.slice(0, 1000)),
            createdAt: run.createdAt.toISOString(),
          };
        }),
      );
      result.candidates = result.candidates.map((candidate) => ({
        ...candidate,
        referencedRuns: references,
      }));
    }
    await saveResolvedSubjects(result.candidates, session);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}

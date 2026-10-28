import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from './index';
import { runs, evidence, debateTurns, resolvedSubjects } from './schema';
import {
  DossierSchema,
  SubjectSchema,
  FinalSchema,
  TurnSchema,
  type Dossier,
  type Turn,
  type FinalVerdict,
  type Subject,
} from '../types';
import { AppError } from '../http';
export async function saveResolvedSubjects(subjects: Subject[], sessionId: string) {
  await db
    .insert(resolvedSubjects)
    .values(subjects.map((s) => ({ id: s.id, sessionId, subject: SubjectSchema.parse(s) })));
}
export async function getResolvedSubject(id: string, sessionId: string) {
  const [s] = await db
    .select()
    .from(resolvedSubjects)
    .where(and(eq(resolvedSubjects.id, id), eq(resolvedSubjects.sessionId, sessionId)))
    .limit(1);
  if (!s)
    throw new AppError(
      'This identity has not been confirmed in your session. Please analyze the input again.',
      422,
    );
  return SubjectSchema.parse(s.subject);
}
export async function saveDossier(dossier: Dossier, sessionId: string) {
  const d = DossierSchema.parse(dossier);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(runs).values({
      id,
      sessionId,
      title: d.subject.title,
      kind: d.subject.kind,
      subject: d.subject,
      dossier: d,
      coverage: Math.round(d.coverage),
    });
    if (d.evidence.length)
      await tx.insert(evidence).values(
        d.evidence.map((e) => ({
          runId: id,
          id: e.id,
          source: e.source,
          componentKey: e.componentKey,
          data: e,
        })),
      );
  });
  return id;
}
export async function getRun(id: string, sessionId: string) {
  const [r] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.sessionId, sessionId)))
    .limit(1);
  if (!r) throw new AppError('Analysis not found in this browser session.', 404);
  const ts = await db
    .select()
    .from(debateTurns)
    .where(eq(debateTurns.runId, id))
    .orderBy(debateTurns.sequence);
  return {
    ...r,
    dossier: DossierSchema.parse(r.dossier),
    verdict: r.verdict ? FinalSchema.parse(r.verdict) : null,
    turns: ts.map((t) => TurnSchema.parse(t.data)),
  };
}
export async function listRuns(sessionId: string) {
  return db
    .select({
      id: runs.id,
      title: runs.title,
      kind: runs.kind,
      status: runs.status,
      coverage: runs.coverage,
      createdAt: runs.createdAt,
      verdict: runs.verdict,
    })
    .from(runs)
    .where(eq(runs.sessionId, sessionId))
    .orderBy(desc(runs.createdAt))
    .limit(20);
}
export async function claimRun(id: string, sessionId: string) {
  const changed = await db
    .update(runs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(
      and(
        eq(runs.id, id),
        eq(runs.sessionId, sessionId),
        sql`(${runs.status} != 'running' OR ${runs.updatedAt} < now() - interval '5 minutes')`,
      ),
    )
    .returning({ id: runs.id });
  if (!changed.length)
    throw new AppError('This jury is already running. Please wait for it to finish.', 409);
}
export async function appendTurn(runId: string, sequence: number, turn: Turn) {
  const data = TurnSchema.parse(turn);
  await db.insert(debateTurns).values({ runId, sequence, role: data.role, data });
}
export async function finishRun(id: string, verdict: FinalVerdict) {
  await db
    .update(runs)
    .set({ status: 'done', verdict: FinalSchema.parse(verdict), updatedAt: new Date() })
    .where(eq(runs.id, id));
}
export async function failRun(id: string) {
  await db.update(runs).set({ status: 'error', updatedAt: new Date() }).where(eq(runs.id, id));
}

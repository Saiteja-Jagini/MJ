import { z } from 'zod';
import { getRun, claimRun, appendTurn, finishRun, failRun } from '@/lib/db/repository';
import { sessionId } from '@/lib/session';
import { readJson, apiError, AppError } from '@/lib/http';
import { structured, modelError } from '@/lib/ai/model';
import { ModelTurnSchema, ChairSchema } from '@/lib/ai/schemas';
import { systemPrompt, turnPrompt } from '@/lib/ai/prompts';
import { cleanTurn, finalize } from '@/lib/scoring';
import type { Role, Turn, JuryEvent } from '@/lib/types';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const { runId } = z
      .object({ runId: z.string().uuid() })
      .strict()
      .parse(await readJson(req, 2000));
    if (!process.env.OPENAI_API_KEY)
      throw new AppError('Add OPENAI_API_KEY to .env.local before starting the jury.', 503);
    const session = await sessionId();
    const run = await getRun(runId, session);
    await claimRun(runId, session);
    const encoder = new TextEncoder();
    const abort = new AbortController();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (event: JuryEvent) => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            } catch {
              closed = true;
              abort.abort();
            }
          }
        };
        const heartbeat = setInterval(() => send({ t: 'heartbeat' }), 10000);
        const turns: Turn[] = [...run.turns];
        let sequence = turns.length;
        const stage = (name: Extract<JuryEvent, { t: 'stage' }>['name']) =>
          send({ t: 'stage', name });
        const generate = async (role: Role, round: Turn['round'], extra = '') => {
          send({ t: 'thinking', role });
          try {
            const raw = await structured(
              role === 'chair' ? ChairSchema : ModelTurnSchema,
              systemPrompt(role, run.dossier),
              turnPrompt(role, run.dossier, round === 'opening' ? [] : turns, extra),
              role === 'chair',
              AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]),
            );
            return cleanTurn(raw, role, round, run.dossier);
          } catch (e) {
            send({ t: 'error', role, msg: modelError(e) });
            return null;
          }
        };
        const record = async (turn: Turn) => {
          await appendTurn(runId, sequence++, turn);
          turns.push(turn);
          send({ t: 'turn', turn });
        };
        try {
          if (run.verdict && run.status === 'done') {
            send({ t: 'verdict', verdict: run.verdict });
            await finishRun(runId, run.verdict);
            return;
          }
          stage('round1');
          const initial: Role[] = ['chemist', 'toxicologist', 'pharmacologist'];
          const needed = initial.filter(
            (r) => !turns.some((t) => t.role === r && t.round === 'opening'),
          );
          const generated = await Promise.all(needed.map((r) => generate(r, 'opening')));
          for (const t of generated) if (t) await record(t);
          if (initial.some((r) => !turns.some((t) => t.role === r)))
            throw new Error('A specialist needs retry');
          let doubt = turns.find((t) => t.role === 'skeptic');
          if (!doubt) {
            stage('crossexam');
            const t = await generate('skeptic', 'cross-exam');
            if (!t) throw new Error('Skeptic needs retry');
            await record(t);
            doubt = t;
          }
          const target = (
            initial.includes(doubt.target as Role)
              ? doubt.target
              : turns
                  .filter((t) => initial.includes(t.role))
                  .sort((a, b) => b.confidence - a.confidence)[0].role
          ) as Role;
          if (!turns.some((t) => t.round === 'rebuttal')) {
            stage('rebuttal');
            const t = await generate(
              target,
              'rebuttal',
              `Doubt challenges you: ${doubt.say}\nRespond to this challenge. You may revise your votes if the evidence warrants it.`,
            );
            if (!t) throw new Error('Rebuttal needs retry');
            await record(t);
          }
          if (!turns.some((t) => t.role === 'chair')) {
            stage('ruling');
            const t = await generate('chair', 'ruling');
            if (!t) throw new Error('Chair needs retry');
            await record(t);
          }
          const verdict = finalize(
            turns,
            run.dossier.prior,
            run.dossier.coverage,
            run.dossier.drivers,
          );
          await finishRun(runId, verdict);
          send({ t: 'verdict', verdict });
        } catch {
          await failRun(runId).catch(() => {});
          send({
            t: 'error',
            role: 'system',
            msg: 'The discussion is saved. Retry the jury to continue from the last successful turn.',
          });
        } finally {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

'use client';
import { create } from 'zustand';
import {
  DossierSchema,
  SubjectSchema,
  TurnSchema,
  FinalSchema,
  type Subject,
  type Dossier,
  type Turn,
  type FinalVerdict,
  type Stage,
  type Role,
} from './types';
import { finalize } from './scoring';
interface State {
  stage: Stage;
  subject: Subject | null;
  candidates: Subject[];
  notes: string;
  dossier: Dossier | null;
  runId: string | null;
  turns: Turn[];
  verdict: FinalVerdict | null;
  live: FinalVerdict | null;
  activeAnchor: string | null;
  thinking: Role[];
  errors: Partial<Record<Role | 'system', string>>;
  error: string | null;
  busy: boolean;
  localChecks: 'idle' | 'checking' | 'verified' | 'server';
  resolve: (body: Record<string, unknown>) => Promise<void>;
  select: (s: Subject) => void;
  convene: () => Promise<void>;
  jury: () => Promise<void>;
  reset: () => void;
  focus: (id: string) => void;
  restore: (id: string) => Promise<void>;
}
let controller: AbortController | null = null;
let generation = 0;
const initial = {
  stage: 'idle' as Stage,
  subject: null,
  candidates: [],
  notes: '',
  dossier: null,
  runId: null,
  turns: [],
  verdict: null,
  live: null,
  activeAnchor: null,
  thinking: [],
  errors: {},
  error: null,
  busy: false,
  localChecks: 'idle' as const,
};
async function request(url: string, body?: unknown, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'The request failed. Please retry.');
  return data;
}
export const useJury = create<State>((set, get) => ({
  ...initial,
  async resolve(body) {
    controller?.abort();
    controller = new AbortController();
    const g = ++generation;
    set({ ...initial, stage: 'resolving', busy: true });
    try {
      const data = await request('/api/resolve', body, controller.signal);
      if (g !== generation) return;
      const candidates = SubjectSchema.array().parse(data.candidates);
      if (!candidates.length) throw new Error('The analysis could not establish a research subject.');
      set({ candidates, subject: candidates[0], notes: data.notes, stage: 'dossier', busy: true });
      await get().convene();
    } catch (e) {
      if (g === generation)
        set({
          stage: 'idle',
          busy: false,
          error: e instanceof Error ? e.message : 'Unable to resolve input.',
        });
    }
  },
  select(subject) {
    set({ subject });
  },
  async convene() {
    const subject = get().subject;
    if (!subject) return;
    const g = generation;
    set({ stage: 'dossier', busy: true, error: null, errors: {} });
    controller = new AbortController();
    try {
      // Run the document's local chemistry/ML path; the server independently verifies the authoritative dossier.
      if (subject.kind !== 'general_research') {
        set({ localChecks: 'checking' });
        void import('./brain-client')
          .then((m) => m.browserAnalysis(subject))
          .then(() => {
            if (g === generation) set({ localChecks: 'verified' });
          })
          .catch(() => {
            if (g === generation) set({ localChecks: 'server' });
          });
      }
      const data = await request('/api/dossier', subject, controller.signal);
      if (g !== generation) return;
      const dossier = DossierSchema.parse(data.dossier);
      set({
        dossier,
        runId: data.runId,
        live: finalize([], dossier.prior, dossier.coverage, dossier.drivers),
        activeAnchor: dossier.anchors[0]?.id ?? null,
      });
      await get().jury();
    } catch (e) {
      if (g === generation)
        set({
          busy: false,
          stage: 'error',
          error: e instanceof Error ? e.message : 'Unable to build the dossier.',
        });
    }
  },
  async jury() {
    const { runId, dossier } = get();
    if (!runId || !dossier) return;
    const g = generation;
    controller = new AbortController();
    set({ busy: true, error: null, errors: {} });
    try {
      const res = await fetch('/api/jury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Unable to convene the jury.');
      }
      if (!res.body) throw new Error('The discussion stream is unavailable.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const receive = (line: string) => {
        if (!line.trim() || g !== generation) return;
        const e = JSON.parse(line);
        if (e.t === 'stage' && ['round1', 'crossexam', 'rebuttal', 'ruling'].includes(e.name))
          set({ stage: e.name });
        if (e.t === 'thinking') set((s) => ({ thinking: [...new Set([...s.thinking, e.role])] }));
        if (e.t === 'turn') {
          const turn = TurnSchema.parse(e.turn);
          set((s) => {
            const turns = [...s.turns, turn];
            return {
              turns,
              thinking: s.thinking.filter((r) => r !== turn.role),
              live: finalize(turns, dossier.prior, dossier.coverage, dossier.drivers),
              activeAnchor: turn.anchor === 'none' ? s.activeAnchor : turn.anchor,
            };
          });
        }
        if (e.t === 'error')
          set((s) => ({
            errors: { ...s.errors, [e.role]: e.msg },
            thinking: s.thinking.filter((r) => r !== e.role),
          }));
        if (e.t === 'verdict') {
          const verdict = FinalSchema.parse(e.verdict);
          set({
            verdict,
            live: verdict,
            stage: 'done',
            busy: false,
            thinking: [],
            activeAnchor: verdict.drivers.find((d) => d.anchorId)?.anchorId ?? get().activeAnchor,
          });
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let pos;
        while ((pos = buffer.indexOf('\n')) >= 0) {
          receive(buffer.slice(0, pos));
          buffer = buffer.slice(pos + 1);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) receive(buffer);
      if (g === generation && !get().verdict) set({ busy: false, stage: 'error', thinking: [] });
    } catch (e) {
      if (g === generation)
        set({
          busy: false,
          stage: 'error',
          thinking: [],
          error: e instanceof Error ? e.message : 'The discussion was interrupted.',
        });
    }
  },
  reset() {
    generation++;
    controller?.abort();
    set({ ...initial });
  },
  focus(activeAnchor) {
    set({ activeAnchor });
  },
  async restore(id) {
    controller?.abort();
    const g = ++generation;
    set({ ...initial, busy: true });
    try {
      const data = await request(`/api/runs/${id}`);
      if (g !== generation) return;
      const dossier = DossierSchema.parse(data.dossier),
        turns = TurnSchema.array().parse(data.turns),
        verdict = data.verdict ? FinalSchema.parse(data.verdict) : null;
      set({
        subject: dossier.subject,
        dossier,
        turns,
        verdict,
        runId: data.runId,
        stage: verdict ? 'done' : 'error',
        live: verdict ?? finalize(turns, dossier.prior, dossier.coverage, dossier.drivers),
        busy: false,
        activeAnchor: dossier.anchors[0]?.id ?? null,
      });
    } catch (e) {
      if (g === generation)
        set({
          busy: false,
          error: e instanceof Error ? e.message : 'Unable to load the saved analysis.',
        });
    }
  },
}));

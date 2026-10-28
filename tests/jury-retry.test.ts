import { describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  turns: [] as any[],
  status: 'ready',
  fail: true,
  calls: [] as string[],
  verdict: null as any,
  decisionFail: false,
  decisionCalls: 0,
}));
vi.mock('../lib/session', () => ({
  sessionId: async () => '11111111-1111-4111-8111-111111111111',
}));
vi.mock('../lib/db/repository', () => ({
  getRun: async () => ({
    status: state.status,
    turns: [...state.turns],
    verdict: state.verdict,
    dossier: {
      subject: {
        title: 'Test',
        question: 'Advance?',
        kind: 'small_molecule',
        components: [{ name: 'Test', role: 'ligand' }],
      },
      evidence: [
        { id: 'E1', source: 'Test', quality: 'annotation', text: 'Evidence', domains: ['all'] },
      ],
      anchors: [],
      prior: { go: 34, caution: 33, nogo: 33 },
      coverage: 50,
      drivers: [],
    },
  }),
  claimRun: async () => {
    state.status = 'running';
  },
  appendTurn: async (_id: string, sequence: number, turn: any) => {
    expect(sequence).toBe(state.turns.length);
    state.turns.push(turn);
  },
  finishRun: async (_id: string, v: any) => {
    state.verdict = v;
    state.status = 'done';
  },
  failRun: async () => {
    state.status = 'error';
  },
}));
vi.mock('../lib/ai/model', () => ({
  modelError: () => 'Retry specialist',
  structured: async (_schema: any, system: string) => {
    const role = system.match(/^You are (\w+)/)?.[1] ?? 'unknown';
    state.calls.push(role);
    if (role === 'toxicologist' && state.fail) {
      state.fail = false;
      throw new Error('temporary failure');
    }
    return {
      say: 'Evidence supports further review [E1].',
      go: 20,
      caution: 60,
      nogo: 20,
      confidence: 60,
      cites: ['E1'],
      anchor: 'none',
      target: role === 'skeptic' ? 'pharmacologist' : 'none',
      headline: 'Investigate the remaining uncertainty',
      reasons: ['One', 'Two', 'Three'],
      risks: ['One', 'Two', 'Three'],
      nextSteps: ['One', 'Two', 'Three'],
    };
  },
}));
import { POST } from '../app/api/jury/route';
vi.mock('../lib/ai/decisions', () => ({
  decide: async () => {
    state.decisionCalls++;
    if (state.decisionFail) {
      state.decisionFail = false;
      throw new Error('Decisions unavailable');
    }
    return {
      provider: 'openai-decisions',
      id: 'dec_retry',
      requestId: null,
      model: 'gpt-6-luna',
      choice: 'CAUTION',
      probabilities: { go: 0.2, caution: 0.6, nogo: 0.2 },
      confidence: 0.6,
      evaluatedAt: new Date().toISOString(),
    };
  },
}));
describe('jury recovery', () => {
  it('saves the debate without issuing a verdict when Decisions fails, then resumes', async () => {
    Object.assign(state, {
      turns: [],
      calls: [],
      status: 'ready',
      verdict: null,
      fail: false,
      decisionFail: true,
      decisionCalls: 0,
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-placeholder');
    const req = () =>
      new Request('http://localhost/api/jury', {
        method: 'POST',
        body: JSON.stringify({ runId: '22222222-2222-4222-8222-222222222222' }),
      });
    const first = await (await POST(req())).text();
    expect(first).not.toContain('"t":"verdict"');
    expect(state.turns).toHaveLength(5);
    expect(state.verdict).toBeNull();
    const second = await (await POST(req())).text();
    expect(second).toContain('"t":"verdict"');
    expect(state.turns).toHaveLength(6);
    expect(state.calls).toHaveLength(6);
    expect(state.decisionCalls).toBe(2);
    vi.unstubAllEnvs();
  });
  it('persists successful seats and resumes only missing stages after a failure', async () => {
    Object.assign(state, {
      turns: [],
      calls: [],
      status: 'ready',
      verdict: null,
      fail: true,
      decisionFail: false,
      decisionCalls: 0,
    });
    vi.stubEnv('OPENAI_API_KEY', 'test-placeholder');
    const req = () =>
      new Request('http://localhost/api/jury', {
        method: 'POST',
        body: JSON.stringify({ runId: '22222222-2222-4222-8222-222222222222' }),
      });
    const first = await (await POST(req())).text();
    expect(first).toContain('Retry specialist');
    expect(state.turns).toHaveLength(2);
    expect(state.status).toBe('error');
    const second = await (await POST(req())).text();
    expect(second).toContain('"t":"verdict"');
    expect(state.turns).toHaveLength(6);
    expect(state.status).toBe('done');
    expect(state.verdict.decision.id).toBe('dec_retry');
    expect(state.calls.filter((x) => x === 'chemist')).toHaveLength(1);
    expect(state.calls.filter((x) => x === 'toxicologist')).toHaveLength(2);
    expect(state.calls.filter((x) => x === 'pharmacologist')).toHaveLength(2);
    expect(
      state.verdict.percent.go + state.verdict.percent.caution + state.verdict.percent.nogo,
    ).toBe(100);
    vi.unstubAllEnvs();
  });
});

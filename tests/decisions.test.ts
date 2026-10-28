import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDecision, decide, decisionRequest } from '../lib/ai/decisions';
import { finalize } from '../lib/scoring';
import type { Dossier, Turn } from '../lib/types';
const raw = () => ({
  id: 'dec_test',
  answers: [
    {
      type: 'choice',
      name: 'research_verdict',
      choice: 'CAUTION',
      confidence: 0.8,
      probabilities: [
        { value: 'GO', probability: 0.1 },
        { value: 'CAUTION', probability: 0.8 },
        { value: 'NO_GO', probability: 0.1 },
      ],
    },
  ],
});
const dossier = {
  subject: {
    title: 'Test',
    kind: 'protein',
    question: 'Advance?',
    components: [{ name: 'Test', sequence: 'PRIVATE_SEQUENCE' }],
  },
  evidence: [],
  anchors: [],
  drivers: [],
  prior: { go: 100, caution: 0, nogo: 0 },
  structure: [{ data: 'PRIVATE_COORDINATES' }],
} as unknown as Dossier;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Decisions API', () => {
  it('accepts the live response format without a decision object ID', () => {
    const response = { answers: raw().answers };
    expect(parseDecision(response, 'req_live').id).toBeNull();
    expect(parseDecision(response, 'req_live').requestId).toBe('req_live');
  });
  it('preserves the actual choice distribution and confidence over local weighted votes', () => {
    const decision = parseDecision(raw(), 'req_test');
    const verdict = finalize(
      [
        {
          role: 'chair',
          go: 100,
          caution: 0,
          nogo: 0,
          confidence: 100,
          decision,
          verified: 0,
          totalCites: 0,
        } as Turn,
      ],
      dossier.prior,
      100,
      [],
    );
    expect(verdict.call).toBe('CAUTION');
    expect(verdict.percent).toEqual({ go: 10, caution: 80, nogo: 10 });
    expect(verdict.confidence).toBe(80);
    expect(verdict.decision?.requestId).toBe('req_test');
  });
  it('rejects refusals, missing answers and duplicate options', () => {
    expect(() => parseDecision({ id: 'x', answers: [{ type: 'refusal' }] }, null)).toThrow();
    expect(() => parseDecision({ id: 'x', answers: [] }, null)).toThrow();
    const r = raw();
    r.answers[0].probabilities[0].value = 'CAUTION';
    expect(() => parseDecision(r, null)).toThrow();
  });
  it('rejects invalid totals and contradictory winning choices', () => {
    const r = raw();
    r.answers[0].probabilities[0].probability = 0.9;
    expect(() => parseDecision(r, null)).toThrow();
    const r2 = raw();
    r2.answers[0].choice = 'GO';
    expect(() => parseDecision(r2, null)).toThrow();
  });
  it('excludes full sequences and coordinates from decision input', () => {
    const request = JSON.stringify(decisionRequest(dossier, []));
    expect(request).not.toContain('PRIVATE_');
    expect(request).toContain('gpt-6-luna');
  });
  it('calls the real endpoint contract and never substitutes a result on failure', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-placeholder');
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(raw()), { headers: { 'x-request-id': 'req_123' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect((await decide(dossier, [])).requestId).toBe('req_123');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/decisions');
    fetcher.mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(decide(dossier, [])).rejects.toThrow('HTTP 403');
  });
});

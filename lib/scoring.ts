import type { Votes, Turn, Driver, Dossier, FinalVerdict, Verdict } from './types';
const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
export function normalize(v: Votes): Votes {
  const arr = [clamp(v.go), clamp(v.caution), clamp(v.nogo)];
  const total = arr.reduce((a, b) => a + b, 0);
  if (!total) return { go: 34, caution: 33, nogo: 33 };
  const raw = arr.map((n) => (n / total) * 100);
  const ints = raw.map(Math.floor);
  const order = raw.map((n, i) => ({ i, f: n - ints[i] })).sort((a, b) => b.f - a.f);
  const remainder = 100 - ints.reduce((a, b) => a + b, 0);
  for (let n = 0; n < remainder; n++) ints[order[n].i]++;
  return { go: ints[0], caution: ints[1], nogo: ints[2] };
}
export function winner(v: Votes): Verdict {
  return Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] === 'go'
    ? 'GO'
    : Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] === 'nogo'
      ? 'NO_GO'
      : 'CAUTION';
}
export function scoreDrivers(drivers: Driver[]): Votes {
  const v = { go: 34, caution: 33, nogo: 33 };
  for (const d of drivers)
    v[d.toward === 'GO' ? 'go' : d.toward === 'NO_GO' ? 'nogo' : 'caution'] += Math.abs(d.delta);
  return normalize(v);
}
export function finalize(
  turns: Turn[],
  prior: Votes,
  coverage: number,
  drivers: Driver[],
): FinalVerdict {
  const latest = new Map(turns.map((t) => [t.role, t]));
  const weights = { chemist: 1, toxicologist: 1.2, pharmacologist: 1.1, skeptic: 0.7 };
  const mix = { go: 0, caution: 0, nogo: 0 };
  let sum = 0;
  for (const [role, w] of Object.entries(weights)) {
    const t = latest.get(role as Turn['role']);
    if (!t) continue;
    const weight = w * (0.3 + (0.7 * clamp(t.confidence)) / 100);
    sum += weight;
    mix.go += t.go * weight;
    mix.caution += t.caution * weight;
    mix.nogo += t.nogo * weight;
  }
  const a = sum ? { go: mix.go / sum, caution: mix.caution / sum, nogo: mix.nogo / sum } : prior;
  const chair = latest.get('chair');
  const c = chair ?? a;
  const percent = normalize({
    go: 0.5 * a.go + 0.3 * c.go + 0.2 * prior.go,
    caution: 0.5 * a.caution + 0.3 * c.caution + 0.2 * prior.caution,
    nogo: 0.5 * a.nogo + 0.3 * c.nogo + 0.2 * prior.nogo,
  });
  const sorted = Object.values(percent).sort((a, b) => b - a);
  return {
    call: winner(percent),
    percent,
    confidence: Math.round(
      Math.min(100, 2 * (sorted[0] - sorted[1])) * (0.4 + (0.6 * coverage) / 100),
    ),
    evidenceGrade: coverage < 25 ? 'LOW' : coverage < 60 ? 'MEDIUM' : 'HIGH',
    evidenceCoverage: coverage,
    headline: chair?.headline ?? 'The jury is reviewing the evidence.',
    reasons: chair?.reasons ?? [],
    risks: chair?.risks ?? [],
    nextSteps: chair?.nextSteps ?? [],
    drivers,
    citationsVerified: `${turns.reduce((n, t) => n + t.verified, 0)}/${turns.reduce((n, t) => n + t.totalCites, 0)}`,
    transcript: turns,
  };
}
export function cleanTurn(
  raw: Record<string, any>,
  role: Turn['role'],
  round: Turn['round'],
  dossier: Dossier,
): Turn {
  const allowed = new Set(
    dossier.evidence
      .filter(
        (e) =>
          e.domains.includes(role) ||
          e.domains.includes('all') ||
          role === 'chair' ||
          role === 'skeptic',
      )
      .map((e) => e.id),
  );
  const anchors = new Set(dossier.anchors.map((a) => a.id));
  const claimed = (Array.isArray(raw.cites) ? raw.cites : [])
    .filter((x: unknown): x is string => typeof x === 'string')
    .map((x: string) => x.replace(/[\[\]]/g, ''));
  const cites = [...new Set<string>(claimed.filter((x: string) => allowed.has(x)))];
  const cleanText = (s: unknown) =>
    String(s ?? '')
      .replace(/\[E\d+\]/g, (id) =>
        allowed.has(id.slice(1, -1)) ? id : '[unverified reference removed]',
      )
      .slice(0, 5000);
  return {
    role,
    round,
    say: cleanText(raw.say),
    ...normalize({ go: raw.go, caution: raw.caution, nogo: raw.nogo }),
    confidence: clamp(raw.confidence),
    cites,
    anchor: anchors.has(raw.anchor) ? raw.anchor : 'none',
    target: ['chemist', 'toxicologist', 'pharmacologist'].includes(raw.target)
      ? raw.target
      : 'none',
    verified: claimed.filter((x: string) => allowed.has(x)).length,
    totalCites: claimed.length,
    ...(role === 'chair'
      ? {
          headline: cleanText(raw.headline),
          reasons: (raw.reasons ?? []).slice(0, 3).map(cleanText),
          risks: (raw.risks ?? []).slice(0, 3).map(cleanText),
          nextSteps: (raw.nextSteps ?? []).slice(0, 3).map(cleanText),
        }
      : {}),
  };
}

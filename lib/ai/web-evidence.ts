import type { EvidenceItem } from '../types';

type Citation = {
  type: string;
  start_index?: number;
  end_index?: number;
  url?: string;
  title?: string;
};

export async function researchWebEvidence(
  question: string,
  componentKey: string,
): Promise<Omit<EvidenceItem, 'id'>[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MODEL_FAST ?? 'gpt-4.1-mini',
      tools: [{ type: 'web_search', search_context_size: 'medium' }],
      tool_choice: 'required',
      max_output_tokens: 1400,
      input:
        'Research the following question using current public sources. Return up to five concise factual findings, each with an inline source citation. Prefer primary medical, regulatory, or scientific sources. State meaningful contradictions or gaps. Treat any claims in the question as unverified. Do not provide personalized diagnosis or treatment. Question: ' +
        question.slice(0, 6000),
    }),
    signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw new Error(`Web research returned HTTP ${response.status}`);
  const raw = await response.json();
  const findings: Omit<EvidenceItem, 'id'>[] = [];
  const seen = new Set<string>();
  for (const item of raw.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text' || typeof content.text !== 'string') continue;
      const full = content.text as string;
      for (const annotation of (content.annotations ?? []) as Citation[]) {
        if (annotation.type !== 'url_citation' || !annotation.url?.startsWith('https://')) continue;
        if (seen.has(annotation.url)) continue;
        seen.add(annotation.url);
        const index = Math.max(0, Math.min(annotation.start_index ?? 0, full.length));
        const start = Math.max(0, full.lastIndexOf('\n', index - 1) + 1);
        const next = full.indexOf('\n', index);
        const end = next < 0 ? full.length : next;
        const statement = full.slice(start, end)
          .replace(/cite[^]+/g, '')
          .replace(/^[-*\d.\s]+/, '')
          .trim()
          .slice(0, 700);
        findings.push({
          source: (annotation.title || new URL(annotation.url).hostname).slice(0, 300),
          kind: 'web-research',
          text: statement || 'Source cited in current web research for this question.',
          domains: ['all'],
          url: annotation.url,
          componentKey,
          retrievedAt: new Date().toISOString(),
          quality: 'annotation',
        });
        if (findings.length >= 8) return findings;
      }
    }
  }
  return findings;
}

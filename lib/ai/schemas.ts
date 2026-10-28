import { z } from 'zod';
// AI schemas contain required fields only. Bounds and references are enforced after generation.
export const ModelTurnSchema = z.object({
  say: z.string().describe('2–4 concise plain-English sentences; cite supplied E# evidence'),
  go: z.number().describe('0–100; votes sum to 100'),
  caution: z.number(),
  nogo: z.number(),
  confidence: z.number().describe('0–100'),
  cites: z.array(z.string()).describe('Only supplied evidence IDs, e.g. E3'),
  anchor: z.string().describe('A supplied anchor ID or none'),
  target: z.string().describe('Skeptic: chemist, toxicologist, or pharmacologist. Otherwise none.'),
});
export const ChairSchema = ModelTurnSchema.extend({
  headline: z.string().describe('At most 14 words'),
  reasons: z.array(z.string()).describe('Exactly three evidence-linked reasons'),
  risks: z.array(z.string()).describe('Exactly three risks or important uncertainties'),
  nextSteps: z
    .array(z.string())
    .describe('Exactly three concrete experiments or checks that could change the verdict'),
});
export const ImageSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum(['compound', 'protein', 'ingredient']),
      name: z.string(),
      smiles: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
  description: z.string(),
});

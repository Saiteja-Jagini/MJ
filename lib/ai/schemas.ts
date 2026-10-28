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
    .describe('Exactly three case-specific experiments or checks that could change the verdict; cite a supplied E# ID when relevant and never imply the test was already done'),
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
export const ResearchInputSchema = z.object({
  molecules: z
    .array(z.string())
    .describe('All explicitly named medicines, drug ingredients, small molecules, metabolites, vitamins, ions, or SMILES in the input; no generic classes'),
  proteins: z.array(z.string()).describe('All explicitly named proteins, peptide hormones, or genes; no generic cell, tissue, disease, or pathway names'),
  target: z.string().describe('The explicitly named protein or gene targeted by a named molecule, or empty string'),
  analysisMode: z.enum(['single_entity', 'mixture', 'molecule_target', 'general'])
    .describe('Single entity, jointly used mixture, one molecule against one target, or general/comparative question'),
  question: z.string().describe('The research decision the user asks, in one short sentence'),
  useCase: z.string().describe('Intended scientific use or goal, or empty string'),
  issue: z
    .string()
    .describe('Specific uncertainty, concern, or failure mode to evaluate, or empty string'),
  reportedObservations: z
    .array(z.string())
    .describe(
      'Assay values, doses, outcomes, or claims explicitly supplied by the user; do not verify them',
    ),
});

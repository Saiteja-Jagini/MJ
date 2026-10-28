import { z } from 'zod';

export const roles = ['chemist', 'toxicologist', 'pharmacologist', 'skeptic', 'chair'] as const;
export const RoleSchema = z.enum(roles);
export const VerdictSchema = z.enum(['GO', 'CAUTION', 'NO_GO']);
export const KindSchema = z.enum(['small_molecule', 'protein', 'complex', 'mixture', 'general_research']);
export type Role = z.infer<typeof RoleSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Kind = z.infer<typeof KindSchema>;
export type Severity = 'danger' | 'warn' | 'info';
export interface Alert {
  id: string;
  label: string;
  smarts: string;
  severity: Severity;
  why: string;
  helper?: boolean;
}
export interface AlertHit extends Omit<Alert, 'smarts'> {
  matches: { atoms: number[]; bonds: number[] }[];
}
export interface ChemResult {
  canonical: string;
  mw: number | null;
  logp: number | null;
  tpsa: number | null;
  hbd: number | null;
  hba: number | null;
  rotb: number | null;
  lipinskiViolations: number;
  alerts: AlertHit[];
}

const finite = z.number().finite();
const bounded = finite.min(0).max(100);
const safeUrl = z
  .string()
  .url()
  .refine((s) => s.startsWith('https://'), 'Only HTTPS source links are allowed');
export const ComponentSchema = z
  .object({
    key: z.string().regex(/^c\d+$/),
    role: z.enum(['ligand', 'target', 'ingredient']),
    name: z.string().min(1).max(500),
    smiles: z.string().max(20000).optional(),
    molblock: z.string().max(5_242_880).optional(),
    cid: z.number().int().positive().optional(),
    chemblId: z
      .string()
      .regex(/^CHEMBL\d+$/)
      .optional(),
    uniprot: z
      .string()
      .regex(/^[A-Z0-9]{6,10}$/)
      .optional(),
    gene: z.string().max(100).optional(),
    sequence: z
      .string()
      .regex(/^[ACDEFGHIKLMNPQRSTVWYBXZOU]+$/i)
      .max(50000)
      .optional(),
    pdbId: z
      .string()
      .regex(/^[1-9][A-Za-z0-9]{3}$/)
      .optional(),
    pdbText: z.string().max(5_242_880).optional(),
    format: z.enum(['pdb', 'cif']).optional(),
    note: z.string().max(2000).optional(),
    illustrative: z.boolean().optional(),
  })
  .strict();
export const SubjectSchema = z
  .object({
    id: z.string().uuid(),
    kind: KindSchema,
    title: z.string().min(1).max(500),
    question: z.string().min(1).max(500),
    components: z.array(ComponentSchema).max(8),
    visualComponents: z.array(ComponentSchema).max(8).optional(),
    origin: z.enum(['text', 'smiles', 'file', 'image']),
    understood: z.string().max(2000),
    confidence: z.enum(['high', 'medium', 'low']),
    userContext: z.string().max(20000).optional(),
    analysisContext: z
      .object({
        useCase: z.string().max(1000),
        issue: z.string().max(1000),
        reportedObservations: z.array(z.string().max(500)).max(12),
      })
      .optional(),
    referencedRuns: z
      .array(
        z.object({
          id: z.string().uuid(),
          title: z.string().max(500),
          question: z.string().max(500),
          call: VerdictSchema.nullable(),
          headline: z.string().max(1000),
          reasons: z.array(z.string().max(1000)).max(3),
          createdAt: z.string().datetime(),
        }),
      )
      .max(4)
      .optional(),
  })
  .strict()
  .superRefine((s, c) => {
    if (new Set([...s.components, ...(s.visualComponents ?? [])].map((x) => x.key)).size !== s.components.length + (s.visualComponents?.length ?? 0))
      c.addIssue({ code: 'custom', message: 'Duplicate component key' });
    const targets = s.components.filter((x) => x.role === 'target').length;
    if (s.kind === 'complex' && (targets !== 1 || s.components.length !== 2))
      c.addIssue({ code: 'custom', message: 'A complex requires one molecule and one target' });
    if (['small_molecule', 'protein'].includes(s.kind) && s.components.length !== 1)
      c.addIssue({ code: 'custom', message: 'Single-subject analysis requires one component' });
    if (s.kind === 'protein' && targets !== 1)
      c.addIssue({ code: 'custom', message: 'Protein must be a target' });
    if (s.kind === 'small_molecule' && targets)
      c.addIssue({ code: 'custom', message: 'Molecule cannot be a target' });
    if (s.kind === 'mixture' && (s.components.length < 2 || targets))
      c.addIssue({ code: 'custom', message: 'Mixture requires at least two ingredients' });
    if (s.kind === 'general_research' && s.components.length !== 0)
      c.addIssue({ code: 'custom', message: 'General research has no verified molecular component' });
  });
export type Component = z.infer<typeof ComponentSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export const VotesSchema = z
  .object({ go: bounded, caution: bounded, nogo: bounded })
  .refine((v) => Math.abs(v.go + v.caution + v.nogo - 100) < 0.02, 'Votes must sum to 100');
export type Votes = z.infer<typeof VotesSchema>;
export const EvidenceSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  source: z.string().min(1),
  kind: z.string().min(1),
  text: z.string().min(1).max(8000),
  domains: z.array(z.union([RoleSchema, z.literal('all')])).min(1),
  url: safeUrl.optional(),
  componentKey: z.string(),
  retrievedAt: z.string().datetime(),
  quality: z.enum(['measured', 'annotation', 'prediction', 'heuristic', 'illustrative']),
});
export const AnchorSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  componentKey: z.string(),
  type: z.enum(['atoms', 'residues', 'ligand', 'overview']),
  atoms: z.array(z.number().int().nonnegative()).optional(),
  residues: z.array(z.object({ chain: z.string(), resi: z.number().int() })).optional(),
  resn: z.string().optional(),
});
export const DriverSchema = z.object({
  label: z.string(),
  delta: finite,
  toward: VerdictSchema,
  anchorId: z.string().optional(),
  evidenceIds: z.array(z.string()).default([]),
});
export const StructureSchema = z.object({
  componentKey: z.string(),
  mode: z.enum(['pdb', 'alphafold', 'conformer', 'flat', 'none']),
  format: z.enum(['pdb', 'cif', 'sdf']).optional(),
  text: z.string().max(15_000_000).optional(),
  url: safeUrl.optional(),
  provenance: z.string(),
  plddt: finite.optional(),
});
export const SourceStatusSchema = z.object({
  name: z.string(),
  status: z.enum(['available', 'missing', 'error']),
  detail: z.string(),
  componentKey: z.string(),
});
export const DossierSchema = z
  .object({
    version: z.literal(2),
    subject: SubjectSchema,
    evidence: z.array(EvidenceSchema).max(400),
    anchors: z.array(AnchorSchema).max(500),
    drivers: z.array(DriverSchema),
    prior: VotesSchema,
    coverage: bounded,
    structure: z.array(StructureSchema),
    sources: z.array(SourceStatusSchema),
    createdAt: z.string().datetime(),
    chemistry: z.record(
      z.object({
        mw: finite.nullable(),
        logp: finite.nullable(),
        tpsa: finite.nullable(),
        hbd: finite.nullable(),
        hba: finite.nullable(),
        rotb: finite.nullable(),
        lipinskiViolations: z.number().int().nonnegative(),
      }),
    ),
  })
  .superRefine((d, c) => {
    const keys = new Set([...d.subject.components, ...(d.subject.visualComponents ?? [])].map((x) => x.key));
    const ids = new Set(d.evidence.map((x) => x.id));
    const anchors = new Set(d.anchors.map((x) => x.id));
    if (ids.size !== d.evidence.length || anchors.size !== d.anchors.length)
      c.addIssue({ code: 'custom', message: 'Duplicate evidence or anchor ID' });
    for (const x of [...d.evidence, ...d.anchors, ...d.structure])
      if (!keys.has(x.componentKey) && !(d.subject.kind === 'general_research' && x.componentKey === ''))
        c.addIssue({ code: 'custom', message: 'Unknown component reference' });
    for (const x of d.drivers) {
      if (x.anchorId && !anchors.has(x.anchorId))
        c.addIssue({ code: 'custom', message: 'Unknown driver anchor' });
      if (x.evidenceIds.some((id) => !ids.has(id)))
        c.addIssue({ code: 'custom', message: 'Unknown driver citation' });
    }
  });
export type EvidenceItem = z.infer<typeof EvidenceSchema>;
export type Anchor = z.infer<typeof AnchorSchema>;
export type Driver = z.infer<typeof DriverSchema>;
export type Structure = z.infer<typeof StructureSchema>;
export type Dossier = z.infer<typeof DossierSchema>;
export const DecisionSchema = z.object({
  provider: z.literal('openai-decisions'),
  id: z.string().min(1).nullable(),
  requestId: z.string().nullable(),
  model: z.literal('gpt-6-luna'),
  choice: VerdictSchema,
  probabilities: z
    .object({
      go: z.number().finite().min(0).max(1),
      caution: z.number().finite().min(0).max(1),
      nogo: z.number().finite().min(0).max(1),
    })
    .refine(
      (v) => Math.abs(v.go + v.caution + v.nogo - 1) < 0.001,
      'Decision probabilities must sum to one',
    ),
  confidence: z.number().finite().min(0).max(1),
  metrics: z
    .record(
      z.object({
        score: z.number().finite().min(0).max(3),
        confidence: z.number().finite().min(0).max(1),
        probabilities: z.array(
          z.object({
            label: z.string(),
            value: z.number().int().min(0).max(3),
            probability: z.number().finite().min(0).max(1),
          }),
        ),
      }),
    )
    .optional(),
  evaluatedAt: z.string().datetime(),
});
export type Decision = z.infer<typeof DecisionSchema>;
export const TurnSchema = z
  .object({
    role: RoleSchema,
    say: z.string().min(1),
    go: bounded,
    caution: bounded,
    nogo: bounded,
    confidence: bounded,
    cites: z.array(z.string()),
    anchor: z.string(),
    target: z.string(),
    verified: z.number().int().nonnegative(),
    totalCites: z.number().int().nonnegative(),
    round: z.enum(['opening', 'cross-exam', 'rebuttal', 'ruling']),
    headline: z.string().optional(),
    reasons: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()).optional(),
    decision: DecisionSchema.optional(),
  })
  .refine((t) => Math.abs(t.go + t.caution + t.nogo - 100) < 0.02, 'Votes must sum to 100');
export type Turn = z.infer<typeof TurnSchema>;
export const FinalSchema = z.object({
  decision: DecisionSchema.optional(),
  call: VerdictSchema,
  percent: VotesSchema,
  confidence: bounded,
  evidenceGrade: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  evidenceCoverage: bounded,
  headline: z.string(),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
  nextSteps: z.array(z.string()),
  drivers: z.array(DriverSchema),
  citationsVerified: z.string(),
  transcript: z.array(TurnSchema),
});
export type FinalVerdict = z.infer<typeof FinalSchema>;
export type Stage =
  | 'idle'
  | 'resolving'
  | 'confirm'
  | 'dossier'
  | 'round1'
  | 'crossexam'
  | 'rebuttal'
  | 'ruling'
  | 'done'
  | 'error';
export type JuryEvent =
  | { t: 'stage'; name: Stage }
  | { t: 'thinking'; role: Role }
  | { t: 'turn'; turn: Turn }
  | { t: 'error'; role: Role | 'system'; msg: string }
  | { t: 'verdict'; verdict: FinalVerdict }
  | { t: 'heartbeat' };
export const QUESTIONS: Record<Kind, string> = {
  small_molecule: 'Should this advance as a drug candidate?',
  protein: 'Is this a tractable, reasonably safe drug target?',
  complex: 'Is this molecule a plausible, safe modulator of this target?',
  mixture: 'Is this combination plausible and low-risk to take forward?',
  general_research: 'What does the available evidence support for this question?',
};

import { z } from 'zod';
import { SubjectSchema, QUESTIONS, type Component, type Subject, type Kind } from './types';
import { sniff, splitComposition } from './sniff';
import { isResearchQuestion, parseResearchQuestion } from './ai/research-input';
import {
  pubchem,
  pcProperties,
  pcSmiles,
  proteinSearch,
  pdbIdentity,
  sequenceSearch,
} from './sources';
import { serverRDKit, validateMolecule } from './chem/server';
import { AppError } from './http';
import seeds from '@/data/seeds.json';
import type { ResearchInputSchema } from './ai/schemas';
export const ResolveInputSchema = z
  .object({
    text: z.string().max(20000).default(''),
    targetText: z.string().max(500).optional(),
    file: z.object({ name: z.string().max(250), text: z.string().max(5_242_880) }).optional(),
    imageBase64: z.string().max(7_000_000).optional(),
    mime: z.enum(['image/png', 'image/jpeg']).optional(),
    preferredKind: z.enum(['small_molecule', 'protein']).optional(),
    referenceRunIds: z.array(z.string().uuid()).max(4).optional(),
  })
  .strict();
export type ResolveInput = z.infer<typeof ResolveInputSchema>;
type ParsedQuestion = z.infer<typeof ResearchInputSchema>;
function generalSubject(
  input: string,
  parsed?: ParsedQuestion,
  origin: Subject['origin'] = 'text',
): Subject {
  const question = (parsed?.question.trim() || input.trim()).slice(0, 500);
  return SubjectSchema.parse({
    id: crypto.randomUUID(),
    kind: 'general_research',
    title: question.slice(0, 96),
    question,
    components: [],
    origin,
    understood: 'General research question. No molecular identity or 3D structure was verified.',
    confidence: 'low',
    userContext: input.trim(),
    analysisContext: {
      useCase: parsed?.useCase.slice(0, 1000) ?? '',
      issue: parsed?.issue.slice(0, 1000) ?? '',
      reportedObservations: parsed?.reportedObservations.slice(0, 12).map((x) => x.slice(0, 500)) ?? [],
    },
  });
}
function subject(
  components: Component[],
  origin: Subject['origin'] = 'text',
  confidence: Subject['confidence'] = 'high',
  context?: {
    question: string;
    input: string;
    useCase: string;
    issue: string;
    reportedObservations: string[];
  },
): Subject {
  const kind: Kind =
    components.length === 1
      ? components[0].role === 'target'
        ? 'protein'
        : 'small_molecule'
      : components.some((c) => c.role === 'target')
        ? 'complex'
        : 'mixture';
  if (kind === 'mixture')
    components = components.map((c) => ({ ...c, role: 'ingredient' as const }));
  const title = components.map((c) => c.name).join(' + ');
  return SubjectSchema.parse({
    id: crypto.randomUUID(),
    kind,
    title,
    question: context?.question || QUESTIONS[kind],
    components: components.map((c, i) => ({ ...c, key: `c${i}` })),
    origin,
    confidence,
    understood: `${title}. ${context?.question || QUESTIONS[kind]}`,
    ...(context
      ? {
          userContext: context.input,
          analysisContext: {
            useCase: context.useCase.slice(0, 1000),
            issue: context.issue.slice(0, 1000),
            reportedObservations: context.reportedObservations
              .slice(0, 12)
              .map((x) => x.slice(0, 500)),
          },
        }
      : {}),
  });
}
async function resolveOne(raw: string, preferred?: string): Promise<Component[]> {
  const trimmed = raw.trim();
  const dose = trimmed.match(/\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|mL|%)\b.*)$/);
  const name = dose ? trimmed.slice(0, dose.index) : trimmed;
  const note = dose?.[1];
  if (!name) throw new AppError('Enter a molecule name, SMILES, or protein.');
  const type = sniff(name);
  if (type === 'pdbid') {
    const p = await pdbIdentity(name.toUpperCase());
    if (!p)
      throw new AppError(
        'That PDB structure could not be resolved. Check the ID or upload the file.',
      );
    return [{ key: 'c0', role: 'target', ...p }];
  }
  if (type === 'fasta') {
    const sequence = name
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('>'))
      .join('')
      .replace(/\s/g, '')
      .toUpperCase();
    if (!/^[ACDEFGHIKLMNPQRSTVWYBXZOU]+$/.test(sequence))
      throw new AppError('The sequence contains unsupported characters.');
    const hit = await sequenceSearch(sequence);
    return [
      {
        key: 'c0',
        role: 'target',
        name: hit?.name ?? 'Uploaded protein sequence',
        sequence,
        ...hit,
        note: hit
          ? 'Sequence matched to an existing structure.'
          : 'No close experimental structure found; no structure prediction has been performed.',
      },
    ];
  }
  const rd = await serverRDKit();
  let mol;
  try {
    mol = rd.get_mol(name);
    if (mol?.is_valid()) {
      const valid = await validateMolecule(name);
      const p = await pubchem(valid.smiles, 'smiles');
      const hit = pcProperties(p);
      return [
        {
          key: 'c0',
          role: 'ligand',
          name: hit?.Title ?? 'Unregistered molecule',
          ...valid,
          ...(hit ? { cid: hit.CID } : {}),
          note,
        },
      ];
    }
  } catch {
  } finally {
    mol?.delete();
  }
  const [pc, up] = await Promise.all([
    preferred === 'protein'
      ? Promise.resolve(null)
      : pubchem(name, type === 'inchi' ? 'inchi' : 'name'),
    preferred === 'small_molecule' || type === 'inchi' || type === 'cas'
      ? Promise.resolve(null)
      : proteinSearch(name),
  ]);
  const candidates: Component[] = [];
  const p = pc ? pcProperties(pc) : null;
  if (p && pcSmiles(p)) {
    const valid = await validateMolecule(pcSmiles(p)!);
    candidates.push({
      key: 'c0',
      role: 'ligand',
      name: p.Title ?? name,
      ...valid,
      cid: p.CID,
      note,
    });
  }
  const hits = up?.data?.results ?? [];
  const exact = hits.filter((hit: any) => {
    const names = [
      ...(hit.genes ?? []).flatMap((g: any) => [
        g.geneName?.value,
        ...(g.synonyms ?? []).map((s: any) => s.value),
      ]),
      hit.proteinDescription?.recommendedName?.fullName?.value,
      ...(hit.proteinDescription?.recommendedName?.shortNames ?? []).map((s: any) => s.value),
      ...(hit.proteinDescription?.alternativeNames ?? []).flatMap((alt: any) => [
        alt.fullName?.value,
        ...(alt.shortNames ?? []).map((s: any) => s.value),
      ]),
    ];
    return names.some((value) =>
      typeof value === 'string' && value.toLowerCase() === name.toLowerCase(),
    );
  });
  for (const hit of (type === 'uniprot' ? hits : exact).slice(0, 3)) {
    const pname = hit.proteinDescription?.recommendedName?.fullName?.value ?? name;
    candidates.push({
      key: 'c0',
      role: 'target',
      name: pname,
      uniprot: hit.primaryAccession,
      gene: hit.genes?.[0]?.geneName?.value,
      sequence: hit.sequence?.value,
    });
  }
  if (!candidates.length) {
    const seed = seeds.find(
      (s) =>
        s.name.toLowerCase() === name.toLowerCase() ||
        s.codename.toLowerCase() === name.toLowerCase(),
    );
    if (seed) {
      const valid = await validateMolecule(seed.smiles);
      return [
        {
          key: 'c0',
          role: 'ligand',
          name: seed.name,
          ...valid,
          illustrative: seed.hypothetical,
          note: seed.hypothetical
            ? seed.curated
                .filter((x) => x.kind === 'pharm')
                .map((x) => x.text)
                .join(' ')
            : 'Identity from the supplied reference library; live database identity lookup was unavailable.',
        },
      ];
    }
    throw new AppError(
      'The named molecule or protein could not be verified against a structure source. Check its spelling or provide a structure file.',
      422,
    );
  }
  return candidates;
}
export async function resolveInput(
  input: ResolveInput,
): Promise<{ candidates: Subject[]; notes: string }> {
  const parsedAttachmentText =
    (input.file || input.imageBase64) && input.text.trim()
      ? await parseResearchQuestion(input.text).catch(() => null)
      : null;
  const context = (parsed: Awaited<ReturnType<typeof parseResearchQuestion>> | null, kind: Kind) =>
    parsed
      ? {
          input: input.text.trim(),
          question: parsed.question.trim().slice(0, 500) || QUESTIONS[kind],
          useCase: parsed.useCase.trim(),
          issue: parsed.issue.trim(),
          reportedObservations: parsed.reportedObservations,
        }
      : undefined;
  if (input.imageBase64) {
    const bytes = Buffer.from(input.imageBase64, 'base64');
    if (bytes.length > 5_242_880) throw new AppError('The image exceeds 5 MB.', 413);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!(input.mime === 'image/png' ? png : jpeg))
      throw new AppError('The image contents do not match a supported PNG or JPEG file.');
    const { extractImage } = await import('./ai/model');
    const extracted = await extractImage(input.imageBase64, input.mime ?? 'image/png');
    const parts: Component[] = [];
    for (const item of extracted.items.slice(0, 8)) {
      try {
        const cs = await resolveOne(
          item.smiles || item.name,
          item.type === 'protein' ? 'protein' : 'small_molecule',
        );
        parts.push(cs[0]);
      } catch {
        if (item.smiles && item.name) {
          try {
            parts.push((await resolveOne(item.name))[0]);
          } catch {}
        }
      }
    }
    if (!parts.length) {
      const imageContext = [
        input.text.trim(),
        extracted.description.trim() && `Visible image content (unverified): ${extracted.description.trim()}`,
      ].filter(Boolean).join('\n');
      if (!imageContext)
        throw new AppError('The image did not contain readable scientific content. Add a question or a clearer image.', 422);
      const parsed = await parseResearchQuestion(imageContext);
      return {
        candidates: [generalSubject(imageContext, parsed, 'image')],
        notes: 'The image was summarized as unverified context. No molecular structure was verified.',
      };
    }
    const requestedTarget = input.targetText?.trim() || parsedAttachmentText?.target;
    if (requestedTarget && !parts.some((p) => p.role === 'target')) {
      if (parts.length !== 1)
        throw new AppError('Use one molecule with one target in a paired analysis.', 422);
      parts.push((await resolveOne(requestedTarget, 'protein'))[0]);
    }
    const imageKind: Kind = parts.some((p) => p.role === 'target')
      ? parts.length > 1 ? 'complex' : 'protein'
      : parts.length > 1 ? 'mixture' : 'small_molecule';
    const imageQuestionContext = context(parsedAttachmentText, imageKind) ?? {
      input: '',
      question: QUESTIONS[imageKind],
      useCase: '',
      issue: '',
      reportedObservations: [] as string[],
    };
    if (extracted.description.trim()) {
      imageQuestionContext.input += `\nVisible image content (unverified): ${extracted.description.trim()}`;
      imageQuestionContext.reportedObservations.push(`Visible image content (unverified): ${extracted.description.trim()}`);
    }
    return {
      candidates: [
        subject(
          parts,
          'image',
          'medium',
          imageQuestionContext,
        ),
      ],
      notes:
        'Compare the reconstructed structure with your original image before continuing. ' +
        extracted.description,
    };
  }
  if (input.file) {
    const ext = input.file.name.split('.').pop()?.toLowerCase();
    if (Buffer.byteLength(input.file.text) > 5_242_880)
      throw new AppError('The file exceeds 5 MB.', 413);
    if (['sdf', 'mol'].includes(ext ?? '')) {
      const blocks = input.file.text.split('$$$$').filter((x) => x.trim());
      if (blocks.length !== 1)
        throw new AppError(
          'Please upload a file containing one molecule. Use composition input for a mixture.',
        );
      const valid = await validateMolecule(blocks[0]);
      const p = pcProperties(await pubchem(valid.smiles, 'smiles'));
      const requestedTarget = input.targetText?.trim() || parsedAttachmentText?.target;
      const target = requestedTarget ? (await resolveOne(requestedTarget, 'protein'))[0] : null;
      return {
        candidates: [
          subject(
            [
              {
                key: 'c0',
                role: 'ligand',
                name: p?.Title ?? input.file.name,
                ...valid,
                ...(p ? { cid: p.CID } : {}),
              },
              ...(target ? [target] : []),
            ],
            'file',
            parsedAttachmentText ? 'medium' : 'high',
            context(parsedAttachmentText, target ? 'complex' : 'small_molecule'),
          ),
        ],
        notes: 'The uploaded atom order is preserved for structural highlights.',
      };
    }
    if (['pdb', 'cif'].includes(ext ?? '')) {
      if (
        (ext === 'pdb' && !/^ATOM  /m.test(input.file.text)) ||
        (ext === 'cif' && !input.file.text.includes('_atom_site.'))
      )
        throw new AppError('This file does not contain a supported protein structure.');
      const molecule = parsedAttachmentText?.molecules[0]
        ? (await resolveOne(parsedAttachmentText.molecules[0], 'small_molecule'))[0]
        : null;
      if (parsedAttachmentText && parsedAttachmentText.molecules.length > 1)
        throw new AppError('Use one molecule with one uploaded protein structure.', 422);
      return {
        candidates: [
          subject(
            [
              ...(molecule ? [molecule] : []),
              {
                key: 'c0',
                role: 'target',
                name: input.file.name,
                pdbText: input.file.text,
                format: ext as 'pdb' | 'cif',
              },
            ],
            'file',
            parsedAttachmentText ? 'medium' : 'high',
            context(parsedAttachmentText, molecule ? 'complex' : 'protein'),
          ),
        ],
        notes: 'The uploaded structure stays out of all language-model prompts.',
      };
    }
    if (['fasta', 'fa', 'faa'].includes(ext ?? '')) {
      const protein = (await resolveOne(input.file.text))[0];
      const molecule = parsedAttachmentText?.molecules[0]
        ? (await resolveOne(parsedAttachmentText.molecules[0], 'small_molecule'))[0]
        : null;
      if (parsedAttachmentText && parsedAttachmentText.molecules.length > 1)
        throw new AppError('Use one molecule with one uploaded protein sequence.', 422);
      return {
        candidates: [
          subject(
            [...(molecule ? [molecule] : []), protein],
            'file',
            parsedAttachmentText ? 'medium' : 'high',
            context(parsedAttachmentText, molecule ? 'complex' : 'protein'),
          ),
        ],
        notes: 'Review the uploaded sequence and your stated research context.',
      };
    }
    throw new AppError('Unsupported file. Use SDF, MOL, PDB, CIF, FASTA, PNG, or JPG.');
  }
  if (input.targetText?.trim()) {
    const narrative = isResearchQuestion(input.text)
      ? await parseResearchQuestion(input.text).catch(() => null)
      : null;
    if (narrative && narrative.molecules.length > 1)
      throw new AppError('Name one molecule for the molecule + target analysis.', 422);
    const moleculeName = narrative ? narrative.molecules[0]?.trim() : input.text;
    if (!moleculeName) throw new AppError('Name the molecule in your research question.', 422);
    let m: Component[], p: Component[];
    try {
      [m, p] = await Promise.all([
        resolveOne(moleculeName, 'small_molecule'),
        resolveOne(input.targetText, 'protein'),
      ]);
    } catch {
      return {
        candidates: [generalSubject(`${input.text}\nTarget supplied: ${input.targetText}`, narrative ?? undefined)],
        notes: 'The named molecule or target could not be verified. The question will proceed without a molecular model.',
      };
    }
    return {
      candidates: [
        subject([m[0], p[0]], 'text', narrative ? 'medium' : 'high', context(narrative, 'complex')),
      ],
      notes: 'The molecule and target will be evaluated together. No docking is performed.',
    };
  }
  if (isResearchQuestion(input.text)) {
    const parsed = await parseResearchQuestion(input.text).catch(() => null);
    if (!parsed)
      return {
        candidates: [generalSubject(input.text)],
        notes: 'Entity extraction was unavailable. The question will proceed without a molecular model.',
      };
    const names = [...new Set(parsed.molecules.map((x) => x.trim()).filter(Boolean))];
    if (names.length > 8 || (parsed.target && names.length > 1))
      throw new AppError(
        'Analyze one molecule with one target, or up to eight mixture ingredients.',
        422,
      );
    if (!names.length && !parsed.target)
      return {
        candidates: [generalSubject(input.text, parsed)],
        notes: 'No molecular structure was verified. The jury will review the question and cited public sources.',
      };
    const moleculeResults = await Promise.allSettled(
      names.map((name) => resolveOne(name, 'small_molecule')),
    );
    const failedNames = names.filter((_, index) => moleculeResults[index].status === 'rejected');
    const molecules = moleculeResults.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.slice(0, 1) : [],
    );
    const targetResult = parsed.target
      ? await resolveOne(parsed.target, 'protein').catch(() => [])
      : [];
    const protein = targetResult.slice(0, 1);
    const unresolved = [...failedNames, ...(parsed.target && !protein.length ? [parsed.target] : [])];
    if (!molecules.length && !protein.length) {
      return {
        candidates: [generalSubject(input.text, parsed)],
        notes: 'A named structure could not be verified. The question will proceed without a molecular model.',
      };
    }
    const components = [...molecules, ...protein];
    const kind: Kind = protein.length
      ? molecules.length
        ? 'complex'
        : 'protein'
      : molecules.length > 1
        ? 'mixture'
        : 'small_molecule';
    const parsedContext = context(parsed, kind)!;
    if (unresolved.length)
      parsedContext.reportedObservations.unshift(
        `Named component not verified: ${unresolved.join(', ')}`.slice(0, 500),
      );
    return {
      candidates: [subject(components, 'text', unresolved.length ? 'low' : 'medium', parsedContext)],
      notes:
        unresolved.length
          ? `Verified structure shown for ${components.map((item) => item.name).join(', ')}. Could not verify: ${unresolved.join(', ')}.`
          : 'Verified structure shown for the extracted component. Assay details in your text remain unverified.',
    };
  }
  const type = sniff(input.text);
  const parts = type === 'fasta' || type === 'inchi' ? [input.text] : splitComposition(input.text);
  if (parts.length > 8) throw new AppError('Use at most eight components in one analysis.');
  if (parts.length > 1) {
    const resolved = await Promise.all(parts.map((p) => resolveOne(p)));
    return {
      candidates: [subject(resolved.map((x) => x[0]))],
      notes: 'Review every component before convening the jury.',
    };
  }
  let candidates: Component[];
  try {
    candidates = await resolveOne(input.text, input.preferredKind);
  } catch {
    const parsed = await parseResearchQuestion(input.text).catch(() => null);
    return {
      candidates: [generalSubject(input.text, parsed ?? undefined)],
      notes: 'No molecular structure was verified. The question will proceed without a molecular model.',
    };
  }
  return {
    candidates: candidates.map((c) =>
      subject(
        [c],
        c.name === 'Unregistered molecule' ? 'smiles' : 'text',
        c.note?.includes('unavailable') ? 'medium' : 'high',
      ),
    ),
    notes: candidates.length > 1 ? 'Select the identity you intended.' : '',
  };
}

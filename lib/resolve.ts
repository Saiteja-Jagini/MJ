import { z } from 'zod';
import { SubjectSchema, QUESTIONS, type Component, type Subject, type Kind } from './types';
import { sniff, splitComposition } from './sniff';
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
export const ResolveInputSchema = z
  .object({
    text: z.string().max(100000).default(''),
    targetText: z.string().max(500).optional(),
    file: z.object({ name: z.string().max(250), text: z.string().max(5_242_880) }).optional(),
    imageBase64: z.string().max(7_000_000).optional(),
    mime: z.enum(['image/png', 'image/jpeg']).optional(),
    preferredKind: z.enum(['small_molecule', 'protein']).optional(),
  })
  .strict();
export type ResolveInput = z.infer<typeof ResolveInputSchema>;
function subject(
  components: Component[],
  origin: Subject['origin'] = 'text',
  confidence: Subject['confidence'] = 'high',
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
    question: QUESTIONS[kind],
    components: components.map((c, i) => ({ ...c, key: `c${i}` })),
    origin,
    confidence,
    understood: `${title}. ${QUESTIONS[kind]}`,
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
  const exact = hits.filter((hit: any) =>
    (hit.genes ?? []).some((g: any) =>
      [g.geneName?.value, ...(g.synonyms ?? []).map((s: any) => s.value)].some(
        (g: any) => typeof g === 'string' && g.toLowerCase() === name.toLowerCase(),
      ),
    ),
  );
  for (const hit of (exact.length ? exact : hits).slice(0, 3)) {
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
      'We could not identify this input. Check the name or supply a valid SMILES, UniProt accession, or structure file.',
      422,
    );
  }
  return candidates;
}
export async function resolveInput(
  input: ResolveInput,
): Promise<{ candidates: Subject[]; notes: string }> {
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
    if (!parts.length)
      throw new AppError(
        'We could not verify a structure or name in that image. Please type the name or SMILES instead.',
        422,
      );
    return {
      candidates: [subject(parts, 'image', 'medium')],
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
            ],
            'file',
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
      return {
        candidates: [
          subject(
            [
              {
                key: 'c0',
                role: 'target',
                name: input.file.name,
                pdbText: input.file.text,
                format: ext as 'pdb' | 'cif',
              },
            ],
            'file',
          ),
        ],
        notes: 'The uploaded structure stays out of all language-model prompts.',
      };
    }
    if (['fasta', 'fa', 'faa'].includes(ext ?? ''))
      return { candidates: [subject(await resolveOne(input.file.text), 'file')], notes: '' };
    throw new AppError('Unsupported file. Use SDF, MOL, PDB, CIF, FASTA, PNG, or JPG.');
  }
  if (input.targetText?.trim()) {
    const [m, p] = await Promise.all([
      resolveOne(input.text, 'small_molecule'),
      resolveOne(input.targetText, 'protein'),
    ]);
    return {
      candidates: [subject([m[0], p[0]])],
      notes: 'The molecule and target will be evaluated together. No docking is performed.',
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
  const candidates = await resolveOne(input.text, input.preferredKind);
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

import type { Anchor, Component, Structure } from './types';
import { fetchText, type Packet } from './sources';
const amino: Record<string, string> = {
  ALA: 'A',
  ARG: 'R',
  ASN: 'N',
  ASP: 'D',
  CYS: 'C',
  GLN: 'Q',
  GLU: 'E',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LEU: 'L',
  LYS: 'K',
  MET: 'M',
  PHE: 'F',
  PRO: 'P',
  SER: 'S',
  THR: 'T',
  TRP: 'W',
  TYR: 'Y',
  VAL: 'V',
};
export async function getStructure(c: Component, p: Record<string, Packet>): Promise<Structure> {
  if (c.role !== 'target') {
    const cid = c.cid ?? p.pubchem?.data?.PropertyTable?.Properties?.[0]?.CID;
    if (cid) {
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`;
      const text = await fetchText(url);
      if (text?.includes('M  END'))
        return {
          componentKey: c.key,
          mode: 'conformer',
          format: 'sdf',
          text,
          provenance: `PubChem CID ${cid} · computed 3D conformer`,
          url,
        };
    }
    return {
      componentKey: c.key,
      mode: c.molblock ? 'flat' : 'none',
      format: 'sdf',
      text: c.molblock,
      provenance: '2D layout · no 3D conformer available',
    };
  }
  if (c.pdbText)
    return {
      componentKey: c.key,
      mode: 'pdb',
      format: c.format ?? 'pdb',
      text: c.pdbText,
      provenance: `Uploaded ${c.format?.toUpperCase() ?? 'PDB'} · provenance supplied by user`,
    };
  const features = (p.uniprot?.data?.features ?? [])
    .filter((f: any) => ['Binding site', 'Active site'].includes(f.type))
    .map((f: any) => f.location?.start?.value)
    .filter(Number.isInteger);
  const references = (p.uniprot?.data?.uniProtKBCrossReferences ?? []).filter(
    (r: any) => r.database === 'PDB',
  );
  const rank = (r: any) => {
    const props = Object.fromEntries((r.properties ?? []).map((x: any) => [x.key, x.value]));
    const ranges = [...String(props.Chains ?? '').matchAll(/=(\d+)-(\d+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    const covered = features.filter((n: number) =>
      ranges.some(([lo, hi]) => n >= lo && n <= hi),
    ).length;
    const resolution = parseFloat(props.Resolution);
    return covered * 20 + (Number.isFinite(resolution) ? Math.max(0, 5 - resolution) : 0);
  };
  // Prefer a structure covering annotated functional sites over the first (often unrelated) domain.
  const pdb = c.pdbId ?? references.sort((a: any, b: any) => rank(b) - rank(a))[0]?.id;
  if (pdb) {
    const url = `https://files.rcsb.org/download/${pdb}.pdb`;
    const text = await fetchText(url);
    if (text && /^ATOM  /m.test(text))
      return {
        componentKey: c.key,
        mode: 'pdb',
        format: 'pdb',
        text,
        provenance: `PDB ${pdb} · experimental structure`,
        url,
      };
  }
  const af = p.alphafold?.data?.[0];
  if (af?.pdbUrl && String(af.pdbUrl).startsWith('https://alphafold.ebi.ac.uk/files/')) {
    const text = await fetchText(af.pdbUrl);
    if (text && /^ATOM  /m.test(text))
      return {
        componentKey: c.key,
        mode: 'alphafold',
        format: 'pdb',
        text,
        url: af.pdbUrl,
        provenance: `AlphaFold prediction${Number.isFinite(af.globalMetricValue) ? ` · mean pLDDT ${Math.round(af.globalMetricValue)}` : ''}`,
        plddt: Number.isFinite(af.globalMetricValue) ? af.globalMetricValue : undefined,
      };
  }
  return { componentKey: c.key, mode: 'none', provenance: 'No verified structure available' };
}
export function proteinAnchors(c: Component, s: Structure, uniprot: any): Anchor[] {
  if (!s.text || s.format !== 'pdb') return [];
  const lines = s.text.split('\n');
  const chains = new Map<string, { resi: number; aa: string }[]>();
  const ligands = new Set<string>();
  for (const line of lines) {
    const resn = line.slice(17, 20).trim();
    if (
      line.startsWith('HETATM') &&
      ![
        'HOH',
        'WAT',
        'NA',
        'CL',
        'MG',
        'ZN',
        'CA',
        'SO4',
        'PO4',
        'GOL',
        'EDO',
        'NO3',
        'DMS',
        'PEG',
        'ACT',
        'BME',
        'MPD',
        'TRS',
      ].includes(resn)
    )
      ligands.add(resn);
    if (!line.startsWith('ATOM  ') || line.slice(12, 16).trim() !== 'CA' || !amino[resn]) continue;
    const chain = line.slice(21, 22).trim();
    const residues = chains.get(chain) ?? [];
    const resi = Number(line.slice(22, 26));
    if (!residues.some((x) => x.resi === resi)) residues.push({ resi, aa: amino[resn] });
    chains.set(chain, residues);
  }
  const anchors: Anchor[] = [...ligands].slice(0, 8).map((resn) => ({
    id: `${c.key}:ligand:${resn}`,
    label: `Co-crystal ligand ${resn}`,
    componentKey: c.key,
    type: 'ligand',
    resn,
  }));
  const sequence = uniprot?.sequence?.value ?? c.sequence;
  for (const feature of (uniprot?.features ?? [])
    .filter((f: any) => ['Binding site', 'Active site'].includes(f.type))
    .slice(0, 30)) {
    const pos = feature.location?.start?.value;
    if (!Number.isInteger(pos) || !sequence) continue;
    const mapped: { chain: string; resi: number }[] = [];
    for (const [chain, rs] of chains) {
      // Map residues by a verified sequence window; never equate UniProt and PDB numbering blindly.
      const window = sequence.slice(Math.max(0, pos - 6), pos + 5);
      const seq = rs.map((r) => r.aa).join('');
      const at = seq.indexOf(window);
      if (window.length >= 6 && at >= 0 && seq.indexOf(window, at + 1) < 0) {
        const r = rs[at + pos - 1 - Math.max(0, pos - 6)];
        if (r) mapped.push({ chain, resi: r.resi });
      }
    }
    if (mapped.length)
      anchors.push({
        id: `${c.key}:site:${pos}`,
        label: `${feature.type} · residue ${pos}`,
        componentKey: c.key,
        type: 'residues',
        residues: mapped,
      });
  }
  return anchors;
}

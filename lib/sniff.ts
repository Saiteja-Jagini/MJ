export type Sniffed = 'pdbid' | 'uniprot' | 'fasta' | 'inchi' | 'cas' | 'text';
export function sniff(raw: string): Sniffed {
  const t = raw.trim();
  if (t.startsWith('>') || /^[ACDEFGHIKLMNPQRSTVWY\s]{30,}$/.test(t)) return 'fasta';
  if (t.startsWith('InChI=')) return 'inchi';
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return 'cas';
  if (/^[1-9][A-Za-z0-9]{3}$/.test(t)) return 'pdbid';
  if (/^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/.test(t))
    return 'uniprot';
  return 'text';
}
export function splitComposition(raw: string): string[] {
  let depth = 0;
  let current = '';
  const out: string[] = [];
  for (const c of raw) {
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (depth === 0 && ['+', ',', '\n'].includes(c)) {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

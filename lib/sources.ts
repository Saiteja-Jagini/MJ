import type { Component } from './types';
export interface Packet<T = any> {
  data: T | null;
  status: 'available' | 'missing' | 'error';
  url: string;
  at: string;
}
const PC = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const CH = 'https://www.ebi.ac.uk/chembl/api/data';
export async function fetchPacket<T = any>(
  url: string,
  init?: RequestInit,
  timeout = 6500,
): Promise<Packet<T>> {
  const at = new Date().toISOString();
  try {
    const r = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!r.ok) return { data: null, status: r.status === 404 ? 'missing' : 'error', url, at };
    const data = (await r.json()) as T;
    return { data, status: 'available', url, at };
  } catch {
    return { data: null, status: 'error', url, at };
  }
}
export async function fetchText(url: string, timeout = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
    if (!r.ok) return null;
    const t = await r.text();
    return t.length < 15_000_000 ? t : null;
  } catch {
    return null;
  }
}
export async function pubchem(input: string, kind: 'name' | 'smiles' | 'cid' | 'inchi' = 'name') {
  const props = 'Title,IUPACName,IsomericSMILES,MolecularWeight,MolecularFormula';
  const url = `${PC}/compound/${kind}/${encodeURIComponent(input)}/property/${props}/JSON`;
  return fetchPacket(url);
}
export function pcProperties(p: Packet) {
  const x = p.data?.PropertyTable?.Properties?.[0];
  return x && Number.isInteger(x.CID) ? x : null;
}
export function pcSmiles(p: any): string | undefined {
  return p?.SMILES ?? p?.IsomericSMILES ?? p?.CanonicalSMILES ?? p?.ConnectivitySMILES;
}
export async function chemblMolecule(c: Component) {
  if (c.chemblId) return fetchPacket(`${CH}/molecule/${c.chemblId}.json`);
  const p = await fetchPacket(
    `${CH}/molecule.json?pref_name__iexact=${encodeURIComponent(c.name)}&limit=2`,
  );
  if (p.data?.molecules?.length === 1) return { ...p, data: p.data.molecules[0] };
  if (c.smiles) {
    const q = await fetchPacket(
      `${CH}/molecule.json?molecule_structures__canonical_smiles__flexmatch=${encodeURIComponent(c.smiles)}&limit=2`,
    );
    return { ...q, data: q.data?.molecules?.length === 1 ? q.data.molecules[0] : null };
  }
  return { ...p, data: null, status: 'missing' as const };
}
export async function proteinSearch(name: string) {
  const exact = /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}$/.test(
    name,
  );
  if (exact) {
    const p = await fetchPacket(
      `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(name)}.json`,
    );
    return { ...p, data: p.data ? { results: [p.data] } : null };
  }
  const aliases: Record<string, string> = { herg: 'KCNH2' };
  const q = aliases[name.toLowerCase()] ?? name;
  return fetchPacket(
    `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(`(gene_exact:${q} OR protein_name:"${q}") AND reviewed:true AND organism_id:9606`)}&format=json&size=3`,
  );
}
export async function pdbIdentity(id: string, entityId?: string) {
  const entry = await fetchPacket(`https://data.rcsb.org/rest/v1/core/entry/${id}`);
  const eid = entityId ?? entry.data?.rcsb_entry_container_identifiers?.polymer_entity_ids?.[0];
  if (!eid) return null;
  const entity = await fetchPacket(
    `https://data.rcsb.org/rest/v1/core/polymer_entity/${id}/${eid}`,
  );
  const acc =
    entity.data?.rcsb_polymer_entity_container_identifiers?.reference_sequence_identifiers?.find(
      (x: any) => x.database_name === 'UniProt',
    )?.database_accession;
  return {
    name: entity.data?.rcsb_polymer_entity?.pdbx_description ?? `PDB ${id}`,
    uniprot: acc,
    sequence: entity.data?.entity_poly?.pdbx_seq_one_letter_code_can?.replace(/\s/g, ''),
    pdbId: id,
  };
}
export async function sequenceSearch(sequence: string) {
  const p = await fetchPacket(
    'https://search.rcsb.org/rcsbsearch/v2/query',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: {
          type: 'terminal',
          service: 'sequence',
          parameters: {
            evalue_cutoff: 0.1,
            identity_cutoff: 0.9,
            sequence_type: 'protein',
            value: sequence,
          },
        },
        return_type: 'polymer_entity',
        request_options: { paginate: { start: 0, rows: 1 } },
      }),
    },
    10000,
  );
  const [id, entity] = p.data?.result_set?.[0]?.identifier?.split('_') ?? [];
  return id ? await pdbIdentity(id, entity) : null;
}
export async function sourcePackets(c: Component, target?: Component) {
  const targetP = target?.uniprot
    ? await fetchPacket(`${CH}/target.json?target_components__accession=${target.uniprot}&limit=2`)
    : null;
  const mol = c.role !== 'target' ? await chemblMolecule(c) : null;
  const mid = mol?.data?.molecule_chembl_id;
  const tid = targetP?.data?.targets?.find(
    (t: any) => t.target_type === 'SINGLE PROTEIN',
  )?.target_chembl_id;
  const tasks: Record<string, Promise<Packet>> = {
    literature: fetchPacket(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`TITLE_ABS:"${c.name}"`)}&format=json&pageSize=6&sort_date:y`,
    ),
  };
  if (c.role === 'target') {
    if (c.uniprot) {
      tasks.uniprot = fetchPacket(`https://rest.uniprot.org/uniprotkb/${c.uniprot}.json`);
      tasks.alphafold = fetchPacket(`https://alphafold.ebi.ac.uk/api/prediction/${c.uniprot}`);
      tasks.ligands = (async () => {
        const p = await fetchPacket(
          `${CH}/target.json?target_components__accession=${c.uniprot}&limit=5`,
        );
        const t = p.data?.targets?.find((x: any) => x.target_type === 'SINGLE PROTEIN');
        if (!t) return { ...p, data: null };
        const a = await fetchPacket(
          `${CH}/activity.json?target_chembl_id=${t.target_chembl_id}&pchembl_value__gte=6&limit=1000`,
        );
        const list = a.data?.activities;
        return {
          ...a,
          data: Array.isArray(list)
            ? {
                count: new Set(list.map((x: any) => x.molecule_chembl_id)).size,
                capped: (a.data?.page_meta?.total_count ?? 0) > 1000,
                targetId: t.target_chembl_id,
              }
            : null,
        };
      })();
      tasks.openTargets = (async () => {
        const p = await fetchPacket('https://api.platform.opentargets.org/api/v4/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query($q:String!){search(queryString:$q,entityNames:["target"]){hits{id}}}',
            variables: { q: c.uniprot },
          }),
        });
        const id = p.data?.data?.search?.hits?.[0]?.id;
        if (!id) return { ...p, data: null };
        const t = await fetchPacket('https://api.platform.opentargets.org/api/v4/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query:
              'query($id:String!){target(ensemblId:$id){approvedSymbol tractability{label modality value} safetyLiabilities{event} associatedDiseases(page:{index:0,size:5}){rows{score disease{name}}}}}',
            variables: { id },
          }),
        });
        return { ...t, data: t.data?.data?.target ? { ...t.data.data.target, id } : null };
      })();
    }
  } else {
    tasks.pubchem = pubchem(
      String(c.cid ?? c.smiles ?? c.name),
      c.cid ? 'cid' : c.smiles ? 'smiles' : 'name',
    );
    tasks.chembl = Promise.resolve(mol!);
    if (mid) {
      tasks.warnings = fetchPacket(`${CH}/drug_warning.json?molecule_chembl_id=${mid}&limit=20`);
      // Never relabel unrelated activity as engagement of an unresolved requested target.
      if (!target || tid)
        tasks.activity = fetchPacket(
          `${CH}/activity.json?molecule_chembl_id=${mid}${tid ? `&target_chembl_id=${tid}` : ''}&pchembl_value__isnull=false&standard_relation=${encodeURIComponent('=')}&limit=100`,
        );
      else
        tasks.activity = Promise.resolve({
          data: null,
          status: 'missing',
          url: '',
          at: new Date().toISOString(),
        });
    }
    tasks.fda = fetchPacket(
      `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`openfda.generic_name:"${c.name}"`)}&limit=1`,
    );
    tasks.faers = fetchPacket(
      `https://api.fda.gov/drug/event.json?search=${encodeURIComponent(`patient.drug.medicinalproduct:"${c.name}"`)}&count=patient.reaction.reactionmeddrapt.exact&limit=5`,
    );
  }
  const settled = await Promise.allSettled(Object.values(tasks));
  const keys = Object.keys(tasks);
  const out: Record<string, Packet> = {};
  settled.forEach((r, i) => {
    out[keys[i]] =
      r.status === 'fulfilled'
        ? r.value
        : { data: null, status: 'error', url: '', at: new Date().toISOString() };
  });
  return out;
}

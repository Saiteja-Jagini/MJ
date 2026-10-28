import {
  DossierSchema,
  type Subject,
  type Dossier,
  type EvidenceItem,
  type Driver,
  type Anchor,
  type Votes,
} from './types';
import { sourcePackets, pcProperties, fetchPacket, type Packet } from './sources';
import { getStructure, proteinAnchors } from './structures';
import { serverRDKit, validateMolecule, compatibleConformer } from './chem/server';
import { analyze } from './chem/analyze';
import { loadBrain } from './brain-server';
import { fingerprint, toxProbs, nearest } from './brain';
import { scoreDrivers, normalize } from './scoring';
import { researchWebEvidence } from './ai/web-evidence';

const text = (v: any, max = 1800) =>
  typeof v === 'string'
    ? v.slice(0, max)
    : Array.isArray(v)
      ? v
          .filter((x) => typeof x === 'string')
          .join(' ')
          .slice(0, max)
      : '';
const finite = (v: any) =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export async function buildDossier(subject: Subject): Promise<Dossier> {
  if (subject.kind === 'general_research') {
    const visualComponents = subject.visualComponents ?? [];
    const structures = await Promise.all(visualComponents.map(async (component) => {
      const packets: Record<string, Packet> = component.uniprot ? {
        uniprot: await fetchPacket(`https://rest.uniprot.org/uniprotkb/${encodeURIComponent(component.uniprot)}.json`),
        alphafold: await fetchPacket(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(component.uniprot)}`),
      } : {};
      return getStructure(component, packets);
    }));
    let web: Omit<EvidenceItem, 'id'>[] = [];
    let webFailed = false;
    try {
      web = await researchWebEvidence(
        `${subject.question}\nUnverified user context: ${subject.userContext ?? ''}`,
        '',
      );
    } catch {
      webFailed = true;
    }
    const evidence: EvidenceItem[] = web.map((item, index) => ({
      ...item, id: `E${index + 1}`,
    }));
    for (const component of visualComponents) {
      const url = component.cid
        ? `https://pubchem.ncbi.nlm.nih.gov/compound/${component.cid}`
        : component.uniprot
          ? `https://www.uniprot.org/uniprotkb/${encodeURIComponent(component.uniprot)}/entry`
          : undefined;
      evidence.push({
        id: `E${evidence.length + 1}`,
        source: component.cid ? 'PubChem identity' : component.uniprot ? 'UniProt identity' : 'Validated input structure',
        kind: 'identity',
        text: `${component.name}: ${component.cid || component.uniprot ? 'reference-matched identity' : 'validated user-supplied structure'} for visualization only. ${component.note ?? ''} This structure does not establish benefit, harm, dose, or relevance to the stated use case.`,
        domains: ['all'], quality: 'annotation', componentKey: component.key,
        url, retrievedAt: new Date().toISOString(),
      });
    }
    evidence.push({
      id: `E${evidence.length + 1}`,
      source: 'Case scope',
      kind: 'scope',
      text: visualComponents.length
        ? 'Named entities were resolved for visualization. Their structures do not prove the stated claim. Source summaries are web-research annotations, not independently measured case data. User observations remain unverified.'
        : 'No molecule or protein structure was verified for this question. Source summaries are web-research annotations, not independently measured case data. User observations remain unverified.',
      domains: ['all'],
      quality: 'heuristic',
      componentKey: '',
      retrievedAt: new Date().toISOString(),
    });
    return DossierSchema.parse({
      version: 2, subject, evidence, anchors: [], drivers: [],
      prior: { go: 33, caution: 34, nogo: 33 },
      coverage: 0, structure: structures, chemistry: {},
      sources: [{
        name: 'Current public web research',
        status: web.length ? 'available' : webFailed ? 'error' : 'missing',
        detail: web.length ? `${web.length} cited source summaries` : 'No cited source was returned',
        componentKey: '',
      }, ...visualComponents.map((component, index) => ({
        name: `${component.name} structure`,
        status: (structures[index].mode === 'none' ? 'missing' : 'available') as 'missing' | 'available',
        detail: structures[index].provenance,
        componentKey: component.key,
      }))],
      createdAt: new Date().toISOString(),
    });
  }
  const rd = await serverRDKit();
  const brain = await loadBrain();
  // Revalidate at the server boundary; intake confirmation cannot inject unchecked structures.
  for (const c of subject.components)
    if (c.role !== 'target' && c.smiles) {
      const verified = await validateMolecule(c.molblock ?? c.smiles);
      if (verified.smiles !== (await validateMolecule(c.smiles)).smiles)
        throw new Error('Molecule identity does not match its structure.');
    }
  const target = subject.components.find((c) => c.role === 'target');
  const parts = await Promise.all(
    subject.components.map(async (c) => {
      const p = await sourcePackets(c, c.role !== 'target' ? target : undefined);
      const structure = await getStructure(c, p);
      const evidence: Omit<EvidenceItem, 'id'>[] = [];
      const anchors: Anchor[] = [
        {
          id: `${c.key}:overview`,
          label: `${c.name} overview`,
          componentKey: c.key,
          type: 'overview',
        },
      ];
      const drivers: Driver[] = [];
      const slots: boolean[] = [];
      const add = (
        source: string,
        kind: string,
        t: string,
        domains: EvidenceItem['domains'],
        quality: EvidenceItem['quality'],
        url?: string,
      ) => {
        if (!t) return -1;
        evidence.push({
          source,
          kind,
          text: t,
          domains,
          quality,
          componentKey: c.key,
          retrievedAt: new Date().toISOString(),
          ...(url?.startsWith('https://') ? { url } : {}),
        });
        return evidence.length - 1;
      };
      const drive = (label: string, delta: number, toward: Driver['toward'], anchorId?: string) =>
        drivers.push({ label, delta, toward, anchorId, evidenceIds: [] });
      let chem: ReturnType<typeof analyze> = null;
      if (c.role !== 'target') {
        let block = structure.text;
        if (block) {
          const mol = rd.get_mol(block);
          if (!mol?.is_valid()) {
            mol?.delete();
            structure.mode = 'flat';
            structure.text = c.molblock;
            block = c.molblock;
          } else {
            const same = compatibleConformer(rd, c.smiles ?? '', block);
            mol.delete();
            if (!same) {
              structure.mode = 'flat';
              structure.text = c.molblock;
              structure.provenance =
                '2D layout · downloaded conformer did not match the confirmed structure';
              block = c.molblock;
            }
          }
        }
        chem = analyze(rd, block ?? c.smiles ?? '');
        slots.push(
          !!pcProperties(p.pubchem ?? { data: null, status: 'missing', at: '', url: '' }),
          !!chem,
        );
        if (chem) {
          add(
            'RDKit',
            'descriptors',
            `Molecular weight ${chem.mw?.toFixed(2) ?? 'unavailable'} Da; cLogP ${chem.logp?.toFixed(2) ?? 'unavailable'}; TPSA ${chem.tpsa?.toFixed(1) ?? 'unavailable'} Å²; H-bond donors ${chem.hbd ?? 'unknown'}; acceptors ${chem.hba ?? 'unknown'}; Lipinski violations ${chem.lipinskiViolations}.`,
            ['chemist'],
            'heuristic',
          );
          for (const alert of chem.alerts) {
            const id = `${c.key}:alert:${alert.id}`;
            anchors.push({
              id,
              label: alert.label,
              componentKey: c.key,
              type: 'atoms',
              atoms: [...new Set(alert.matches.flatMap((m) => m.atoms))],
            });
            add(
              'RDKit',
              'alert',
              `${alert.label}: ${alert.why}`,
              ['chemist', 'toxicologist'],
              'heuristic',
            );
          }
          chem.alerts
            .filter((a) => a.severity === 'danger')
            .slice(0, 2)
            .forEach((a) =>
              drive(a.label + ' (danger alert)', -18, 'NO_GO', `${c.key}:alert:${a.id}`),
            );
          chem.alerts
            .filter((a) => a.severity === 'warn' && a.id !== 'herg_pattern')
            .slice(0, 3)
            .forEach((a) => drive(a.label + ' (warning)', -6, 'CAUTION', `${c.key}:alert:${a.id}`));
          if (chem.alerts.some((a) => a.id === 'herg_pattern'))
            drive('hERG-liability pattern', -10, 'NO_GO', `${c.key}:alert:herg_pattern`);
          if (chem.lipinskiViolations >= 2)
            drive(
              `${chem.lipinskiViolations} Lipinski violations`,
              -8,
              'CAUTION',
              `${c.key}:overview`,
            );
        }
        if (brain && c.smiles) {
          const fp = fingerprint(rd, c.smiles);
          const tox = toxProbs(fp, brain.models);
          const neighbors = nearest(fp, brain.precedents);
          slots.push(
            Object.values(tox).some((t) => t.inDomain),
            neighbors.some((n) => n.sim > 0.5),
          );
          for (const [key, t] of Object.entries(tox)) {
            add(
              'TDC model',
              'toxicity',
              `${key.toUpperCase()}: model score ${(100 * t.p).toFixed(1)}%; held-out AUC ${t.auc}; ${t.n} training-dataset compounds; ${t.inDomain ? 'within' : 'OUTSIDE'} applicability domain (nearest training similarity ${t.maxSim.toFixed(2)}). This is a heuristic model score, not a clinical probability.`,
              ['toxicologist', 'chemist'],
              'prediction',
              'https://tdcommons.ai/single_pred_tasks/tox/',
            );
            if (t.inDomain && t.p > 0.6)
              drive(
                `${key.toUpperCase()} model: elevated score`,
                -Math.round(30 * (t.p - 0.5)),
                'NO_GO',
              );
            if (t.inDomain && t.p < 0.3) drive(`${key.toUpperCase()} model: lower score`, 6, 'GO');
          }
          for (const n of neighbors) {
            add(
              'Precedent library',
              'precedent',
              `${n.name ?? 'ClinTox compound'}: ${n.label}; fingerprint similarity ${n.sim.toFixed(3)}. Similarity alone does not establish the same safety or efficacy.`,
              ['chemist', 'toxicologist'],
              'annotation',
              n.chemblId
                ? `https://www.ebi.ac.uk/chembl/explore/compound/${n.chemblId}`
                : undefined,
            );
            if (n.sim > 0.6)
              drive(
                `Similar to ${n.label} ${n.name ?? 'compound'}`,
                n.label === 'approved' ? Math.round(12 * n.sim) : -Math.round(15 * n.sim),
                n.label === 'approved' ? 'GO' : 'NO_GO',
              );
          }
        } else {
          slots.push(false, false);
          add(
            'Model availability',
            'missing',
            'Trained toxicity models or fingerprint parity verification are unavailable. No model result has been substituted.',
            ['all'],
            'annotation',
          );
        }
        const m = p.chembl?.data;
        slots.push(!!m);
        if (m) {
          const url = `https://www.ebi.ac.uk/chembl/explore/compound/${m.molecule_chembl_id}`;
          add(
            'ChEMBL',
            'regulatory',
            `Development phase: ${m.max_phase ?? 'unreported'}; withdrawn flag: ${m.withdrawn_flag === true ? 'yes' : m.withdrawn_flag === false ? 'no' : 'unreported'}; boxed warning: ${m.black_box_warning === 1 ? 'yes' : m.black_box_warning === 0 ? 'no' : 'unreported'}.`,
            ['toxicologist'],
            'annotation',
            url,
          );
          if (m.withdrawn_flag === true) drive('Withdrawal recorded by ChEMBL', -25, 'NO_GO');
          if (m.black_box_warning === 1) drive('Boxed warning recorded by ChEMBL', -12, 'CAUTION');
        }
        const acts = (p.activity?.data?.activities ?? []).filter(
          (a: any) =>
            finite(a.pchembl_value) !== null && !a.data_validity_comment && !a.potential_duplicate,
        );
        if (target) slots.push(acts.length > 0);
        if (acts.length) {
          const values = acts
            .map((a: any) => Number(a.pchembl_value))
            .sort((a: number, b: number) => a - b);
          const mid = Math.floor(values.length / 2);
          const med = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
          const assays = acts
            .slice(0, 8)
            .map(
              (a: any) =>
                `${a.target_chembl_id}: ${a.standard_type} ${a.standard_value} ${a.standard_units}; pChEMBL ${a.pchembl_value}`,
            )
            .join('; ');
          add(
            'ChEMBL',
            'activity',
            `${acts.length} retrieved activity records${target ? ` for ${target.name}` : ' across recorded targets'}; median pChEMBL ${med.toFixed(2)}. ${assays}. Cross-assay values are not a direct selectivity measurement.`,
            ['pharmacologist'],
            'measured',
            p.activity.url,
          );
          if (med >= 7)
            drive(`Recorded potency · pChEMBL ${med.toFixed(1)}`, 18, 'GO', `${c.key}:overview`);
          else if (med < 5) drive('Weak recorded activity', -8, 'NO_GO');
        } else
          drive(
            target ? 'No verified activity for this target' : 'No retrieved potency data',
            -8,
            'CAUTION',
          );
        const warnings = new Set<string>();
        for (const w of p.warnings?.data?.drug_warnings ?? [])
          warnings.add(
            `${text(w.warning_type)}: ${text(w.warning_description)} ${text(w.warning_class)} ${text(w.warning_country)}`,
          );
        for (const warning of warnings)
          add('ChEMBL', 'warning', warning, ['toxicologist'], 'annotation', p.warnings.url);
        const fda = p.fda?.data?.results?.[0];
        if (Number(m?.max_phase) === 4) slots.push(!!fda);
        if (fda) {
          add(
            'openFDA',
            'label',
            `Label warnings: ${text(fda.boxed_warning) || text(fda.warnings) || 'No warning section returned.'}`,
            ['toxicologist'],
            'annotation',
            p.fda.url,
          );
          if (fda.drug_interactions)
            add(
              'openFDA',
              'interactions',
              text(fda.drug_interactions, 3500),
              ['toxicologist'],
              'annotation',
              p.fda.url,
            );
        }
        const reports = p.faers?.data?.results;
        if (Array.isArray(reports) && reports.length)
          add(
            'openFDA FAERS',
            'reports',
            `Spontaneous adverse-event reports (not causality, incidence, or proof of risk): ${reports.map((r: any) => `${r.term}: ${r.count} reports`).join('; ')}. Reporting bias and confounding apply.`,
            ['toxicologist'],
            'annotation',
            p.faers.url,
          );
        if (c.illustrative && c.note)
          add(
            'User reference example',
            'illustrative',
            `ILLUSTRATIVE, not experimentally verified: ${c.note}`,
            ['pharmacologist'],
            'illustrative',
          );
      } else {
        const up = p.uniprot?.data;
        const ot = p.openTargets?.data;
        const ligand = p.ligands?.data;
        anchors.push(...proteinAnchors(c, structure, up));
        const sites = anchors.filter((a) => a.type === 'residues');
        slots.push(
          !!up,
          structure.mode !== 'none',
          !!ligand?.count,
          !!ot?.tractability,
          Array.isArray(ot?.safetyLiabilities),
          !!ot?.associatedDiseases?.rows?.length,
          sites.length > 0,
        );
        if (up) {
          add(
            'UniProt',
            'function',
            (up.comments ?? [])
              .filter((x: any) => x.commentType === 'FUNCTION')
              .flatMap((x: any) => x.texts ?? [])
              .map((x: any) => x.value)
              .join(' ')
              .slice(0, 3000) ||
              'Reviewed protein entry is available; function text was not returned.',
            ['pharmacologist'],
            'annotation',
            `https://www.uniprot.org/uniprotkb/${c.uniprot}/entry`,
          );
          if (sites.length) {
            add(
              'UniProt',
              'binding-site',
              `${sites.length} annotated binding/active sites mapped to the displayed structure by sequence.`,
              ['chemist', 'pharmacologist'],
              'annotation',
              `https://www.uniprot.org/uniprotkb/${c.uniprot}/entry`,
            );
            drive('Annotated binding site', 10, 'GO', sites[0].id);
          }
        }
        if (structure.mode !== 'none') {
          drive('Protein structure available', 10, 'GO', `${c.key}:overview`);
          add(
            structure.mode === 'alphafold' ? 'AlphaFold' : 'RCSB / uploaded structure',
            'structure',
            structure.provenance,
            ['chemist', 'pharmacologist'],
            structure.mode === 'alphafold' ? 'prediction' : 'annotation',
            structure.url,
          );
        }
        if (structure.plddt !== undefined) {
          if (structure.plddt > 80)
            drive('Higher predicted structure confidence', 8, 'GO', `${c.key}:overview`);
          else if (structure.plddt < 60)
            drive('Low predicted structure confidence', -8, 'CAUTION', `${c.key}:overview`);
        }
        if (ligand) {
          add(
            'ChEMBL',
            'ligandability',
            `${ligand.capped ? 'At least ' : ''}${ligand.count} distinct recorded ligands with pChEMBL ≥ 6 in the retrieved set. This is a ligandability signal, not a pocket calculation.`,
            ['pharmacologist'],
            'annotation',
            p.ligands.url,
          );
          if (ligand.count >= 20) drive('Known potent ligands', 15, 'GO');
          else if (ligand.count === 0) drive('No potent ligands retrieved', -8, 'CAUTION');
        }
        if (ot) {
          const url = `https://platform.opentargets.org/target/${ot.id}`;
          const tract = (ot.tractability ?? []).filter((x: any) => x.value);
          add(
            'Open Targets',
            'tractability',
            `Positive tractability annotations: ${tract.map((x: any) => `${x.modality}: ${x.label}`).join('; ') || 'none returned'}.`,
            ['pharmacologist'],
            'annotation',
            url,
          );
          if (tract.some((x: any) => /small|SM/i.test(x.modality)))
            drive('Small-molecule tractability evidence', 15, 'GO');
          const safety = ot.safetyLiabilities ?? [];
          add(
            'Open Targets',
            'safety',
            `Target safety annotations: ${safety.map((x: any) => x.event).join('; ') || 'none returned; absence is not proof of safety'}.`,
            ['toxicologist', 'pharmacologist'],
            'annotation',
            url,
          );
          if (safety.length >= 3) drive('Multiple target safety annotations', -15, 'NO_GO');
          const diseases = ot.associatedDiseases?.rows ?? [];
          if (diseases.length) {
            add(
              'Open Targets',
              'disease',
              diseases
                .map(
                  (x: any) => `${x.disease.name}: association score ${Number(x.score).toFixed(2)}`,
                )
                .join('; '),
              ['pharmacologist'],
              'annotation',
              url,
            );
            if (diseases[0].score >= 0.5) drive('Disease association evidence', 12, 'GO');
            else if (diseases[0].score < 0.1)
              drive('Limited disease association evidence', -8, 'CAUTION');
          }
        }
      }
      const papers = p.literature?.data?.resultList?.result ?? [];
      slots.push(papers.length > 0);
      for (const paper of papers) {
        const title = text(paper.title);
        const safety = /toxic|safety|adverse|risk|injury|cardiac|mutagen|withdraw/i.test(title);
        add(
          'Europe PMC',
          safety ? 'safety-paper' : 'efficacy-paper',
          `${title} (${paper.pubYear ?? 'year unknown'}). Abstract/metadata evidence only; full text has not been evaluated.`,
          [safety ? 'toxicologist' : 'pharmacologist'],
          'annotation',
          `https://europepmc.org/article/${encodeURIComponent(paper.source ?? 'MED')}/${encodeURIComponent(paper.id)}`,
        );
      }
      return { c, evidence, anchors, drivers, structure, chem, slots, p };
    }),
  );
  const allEvidence: EvidenceItem[] = [];
  const anchors: Anchor[] = [];
  const sources: Dossier['sources'] = [];
  const chemistry: Dossier['chemistry'] = {};
  let drivers: Driver[] = [];
  const priors: Votes[] = [];
  let filled = 0,
    total = 0;
  for (const part of parts) {
    const ids = part.evidence.map((e) => {
      const id = `E${allEvidence.length + 1}`;
      allEvidence.push({ ...e, id });
      return id;
    });
    for (const d of part.drivers)
      d.evidenceIds = ids
        .filter((_, i) => {
          const e = part.evidence[i];
          return d.anchorId?.includes(':alert:')
            ? e.kind === 'alert'
            : d.label.includes('model')
              ? e.kind === 'toxicity'
              : d.label.includes('Similar')
                ? e.kind === 'precedent'
                : d.label.includes('potency')
                  ? e.kind === 'activity'
                  : [
                      'regulatory',
                      'warning',
                      'tractability',
                      'disease',
                      'safety',
                      'structure',
                      'binding-site',
                    ].includes(e.kind);
        })
        .slice(0, 4);
    anchors.push(...part.anchors);
    drivers.push(...part.drivers);
    priors.push(scoreDrivers(part.drivers));
    filled += part.slots.filter(Boolean).length;
    total += part.slots.length;
    for (const [name, p] of Object.entries(part.p))
      sources.push({
        name,
        status: p.data ? p.status : p.status === 'error' ? 'error' : 'missing',
        detail: p.data
          ? 'Retrieved for this analysis'
          : p.status === 'error'
            ? 'Source unavailable or timed out'
            : 'No matching record returned',
        componentKey: part.c.key,
      });
    if (part.chem) {
      const { mw, logp, tpsa, hbd, hba, rotb, lipinskiViolations } = part.chem;
      chemistry[part.c.key] = { mw, logp, tpsa, hbd, hba, rotb, lipinskiViolations };
    }
  }
  const coverage = total ? Math.round((filled / total) * 100) : 0;
  allEvidence.push({
    id: `E${allEvidence.length + 1}`,
    source: 'Dossier',
    kind: 'overview',
    text: `${subject.title}. Question: ${subject.question} Evidence coverage ${coverage}%. Missing sources are not evidence of safety.${subject.kind === 'mixture' ? ` Supplied quantities: ${subject.components.map((c) => `${c.name}: ${c.note ?? 'not supplied'}`).join('; ')}. No quantitative dose/exposure or interaction simulation is performed.` : ''}`,
    domains: ['all'],
    quality: 'annotation',
    componentKey: subject.components[0].key,
    retrievedAt: new Date().toISOString(),
  });
  try {
    const web = await researchWebEvidence(
      `${subject.question}\nVerified components: ${subject.components.map((c) => c.name).join(', ')}.\nUnverified user context: ${subject.userContext ?? ''}`,
      subject.components[0].key,
    );
    for (const item of web)
      allEvidence.push({ ...item, id: `E${allEvidence.length + 1}` });
    sources.push({
      name: 'Current public web research',
      status: web.length ? 'available' : 'missing',
      detail: web.length ? `${web.length} cited source summaries` : 'No cited source was returned',
      componentKey: subject.components[0].key,
    });
  } catch {
    sources.push({
      name: 'Current public web research',
      status: 'error',
      detail: 'Web research was unavailable for this run',
      componentKey: subject.components[0].key,
    });
  }
  let prior = scoreDrivers(drivers);
  if (subject.kind === 'mixture') {
    prior = priors.sort((a, b) => b.nogo - a.nogo || b.caution - a.caution)[0];
    const interactions = parts.some((p) => {
      const txt = text(p.p.fda?.data?.results?.[0]?.drug_interactions, 10000).toLowerCase();
      return subject.components.some(
        (c) => c.key !== p.c.key && txt.includes(c.name.toLowerCase()),
      );
    });
    if (interactions) {
      drivers.push({
        label: 'Another component is mentioned in label interaction text',
        delta: -10,
        toward: 'CAUTION',
        evidenceIds: allEvidence.filter((e) => e.kind === 'interactions').map((e) => e.id),
      });
      prior = normalize({ ...prior, caution: prior.caution + 10 });
    }
  }
  drivers = drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
  // Raw uploaded coordinates are stored in structure only, never in the AI subject summary.
  return DossierSchema.parse({
    version: 2,
    subject,
    evidence: allEvidence,
    anchors,
    drivers,
    prior,
    coverage,
    structure: parts.map((p) => p.structure),
    sources,
    chemistry,
    createdAt: new Date().toISOString(),
  });
}

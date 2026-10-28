'use client';
import { useEffect, useState } from 'react';
import { Dialog } from './ui/dialog';
import { ShieldCheck, Database, Scale, FlaskConical } from 'lucide-react';
export function About({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [manifest, setManifest] = useState<any>(null);
  useEffect(() => {
    if (open)
      fetch('/brain/manifest.json')
        .then((r) => (r.ok ? r.json() : null))
        .then(setManifest)
        .catch(() => {});
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Science, with its limits in view."
      description="How MoleculeJury reaches a decision—and what that decision means."
      wide
    >
      <div className="about-body">
        <div className="about-callout">
          <FlaskConical size={23} />
          <p>
            MoleculeJury is an evidence-based research triage tool for students and early
            researchers. It does not predict clinical success, perform docking, or provide
            patient-specific advice.
          </p>
        </div>
        <h3>
          <Scale size={17} />A transparent vote
        </h3>
        <p>
          The final distribution combines confidence-weighted specialist votes (50%), the chair’s
          votes (30%), and deterministic rule evidence (20%). A rebuttal replaces the specialist’s
          earlier vote. Every distribution sums to 100%.
        </p>
        <div className="formula">final = 0.50 × specialists + 0.30 × chair + 0.20 × rules</div>
        <p>
          Specialist weights: Atom 1.0, Venom 1.2, Lock 1.1, Doubt 0.7. Confidence weights use 0.3 +
          0.7 × confidence / 100. Overall confidence uses the gap between the top two outcomes,
          discounted by evidence coverage.
        </p>
        <p>
          Evidence grade: LOW below 25% coverage, MEDIUM below 60%, HIGH otherwise. Coverage below
          20% is labelled insufficient evidence. These grades describe coverage, not an independent
          scientific quality review.
        </p>
        <h3>
          <Database size={17} />
          Public data & trained models
        </h3>
        <p>
          PubChem, ChEMBL, UniProt, RCSB PDB, AlphaFold DB, Open Targets, openFDA, and Europe PMC
          supply live evidence. Rules run in RDKit. Logistic regression models use 2,048-bit Morgan
          fingerprints from public TDC toxicity datasets.
        </p>
        {manifest ? (
          <div className="model-table">
            <div>
              <strong>Endpoint</strong>
              <strong>Held-out AUC</strong>
              <strong>Compounds</strong>
            </div>
            {Object.entries(manifest.models ?? {}).map(([k, v]: [string, any]) => (
              <div key={k}>
                <span>{k.toUpperCase()}</span>
                <span>{v.auc}</span>
                <span>{v.n}</span>
              </div>
            ))}
            <p>
              {manifest.precedents} precedent compounds. Models use a deduplicated random 80/20
              split; this is not a prospective or scaffold-split validation.
            </p>
          </div>
        ) : (
          <p>
            Model artifacts are not yet available. Missing models are reported rather than
            simulated.
          </p>
        )}
        <h3>
          <ShieldCheck size={17} />
          What the interface promises
        </h3>
        <ul>
          <li>
            Image interpretations must be confirmed; parsing is not proof of correct recognition.
          </li>
          <li>
            Only dossier citation IDs can appear as verified references. This is not a guarantee
            that every interpretation is correct.
          </li>
          <li>FAERS reports are not proof of causation or incidence.</li>
          <li>AlphaFold structures are predictions. Their pLDDT is shown when available.</li>
          <li>
            A molecule beside a protein has not been docked. Structural alerts are hypotheses, not
            proof of toxicity.
          </li>
          <li>
            Polymers, inorganics, materials, nucleic acids, antibodies, and food/cosmetic
            formulations are outside the intended scope.
          </li>
        </ul>
        <p className="micro-note">
          AI provider: OpenAI. The app sends the confirmed subject summary and evidence excerpts for
          analysis. Uploaded protein coordinates are excluded from model prompts. Analyses are saved
          to your configured PostgreSQL database.
        </p>
      </div>
    </Dialog>
  );
}

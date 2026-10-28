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
          <Scale size={17} />A decision grounded in evidence
        </h3>
        <p>
          OpenAI Decisions evaluates the dossier and specialist debate to choose GO, CAUTION, or
          NO-GO. The chair explains that result and recommends next experiments. The final
          percentages come directly from the Decisions choice distribution, rounded to total 100%.
        </p>
        <p>
          For a typed research question, the model extracts the named subject and question for your
          confirmation. The full typed context is included in the discussion as unverified user
          input. General model knowledge may explain mechanisms or suggest experiments; it is not a
          verified source for case-specific claims.
        </p>
        <div className="formula">evidence + debate → Decisions API → explained verdict</div>
        <p>
          During debate, weighted votes show a provisional direction. They do not override the final
          API decision. Confidence is the API&apos;s separate confidence field, not a clinical
          probability. Older saved analyses are labelled as legacy weighted results.
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
          AI provider: OpenAI. The app sends the confirmed subject summary, your typed research
          context, and evidence excerpts for analysis. Uploaded protein coordinates are excluded
          from model prompts. Analyses are saved to your configured PostgreSQL database.
        </p>
      </div>
    </Dialog>
  );
}

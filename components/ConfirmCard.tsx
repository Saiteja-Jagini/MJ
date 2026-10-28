'use client';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FlaskConical,
  Dna,
  ShieldCheck,
  TriangleAlert,
  Pencil,
  LoaderCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useJury } from '@/lib/store';
import { Mol2D } from './Mol2D';
import { Button } from './ui/button';
export function ConfirmCard({ originalImage }: { originalImage: string | null }) {
  const { subject, candidates, notes, busy, select, convene, reset, resolve } = useJury();
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState('');
  if (!subject) return null;
  return (
    <div className="confirm-view">
      <button className="text-button" onClick={reset}>
        <ArrowLeft size={16} />
        Back to input
      </button>
      <div className="eyebrow">IDENTITY CHECK</div>
      <h1>Here’s what we understood.</h1>
      <p className="page-description">
        A good verdict starts with the right subject. Take a moment to check.
      </p>
      {candidates.length > 1 && (
        <div className="candidate-options">
          {candidates.map((s) => (
            <button
              key={s.id}
              onClick={() => select(s)}
              className={subject.id === s.id ? 'selected' : ''}
            >
              {s.kind === 'protein' ? <Dna size={17} /> : <FlaskConical size={17} />}
              <span>
                {s.title}
                <small>{s.components[0].uniprot ?? s.kind.replace('_', ' ')}</small>
              </span>
              {subject.id === s.id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
      <section className="confirm-panel">
        <div className="confirm-structures">
          {originalImage && (
            <div className="original-image">
              <img src={originalImage} alt="Your uploaded structure for comparison" />
              <span>YOUR ORIGINAL IMAGE</span>
            </div>
          )}
          {subject.components.map((c) => (
            <div className="confirm-specimen" key={c.key}>
              {c.smiles ? (
                <Mol2D smiles={c.smiles} molblock={c.molblock} />
              ) : (
                <div className="protein-preview">
                  <Dna size={80} strokeWidth={0.8} />
                  <span>{c.gene ?? c.uniprot ?? 'PROTEIN STRUCTURE'}</span>
                </div>
              )}
              <div className="specimen-label">
                <span className="status-dot" />
                {c.role === 'target' ? 'Protein target' : 'RDKit-validated structure'}
              </div>
            </div>
          ))}
        </div>
        <div className="confirm-details">
          <span className="pill-violet">
            {subject.kind.replace('_', ' ').replace('complex', 'molecule + target')}
          </span>
          <h2>{subject.title}</h2>
          <p>{subject.question}</p>
          <dl>
            {subject.components.map((c) => (
              <div key={c.key}>
                <dt>{c.role === 'target' ? 'Target identity' : 'Compound identity'}</dt>
                <dd>{c.name}</dd>
                {c.note && subject.kind === 'mixture' && (
                  <dd className="mono">Supplied quantity: {c.note}</dd>
                )}
                {(c.cid || c.uniprot || c.pdbId) && (
                  <dd className="mono">
                    {c.cid
                      ? `PubChem CID ${c.cid}`
                      : c.uniprot
                        ? `UniProt ${c.uniprot}`
                        : `PDB ${c.pdbId}`}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          {subject.confidence !== 'high' && (
            <div className="warning-note">
              <TriangleAlert size={16} />
              <span>
                Identification needs your review. Check the name and reconstructed structure
                carefully.
              </span>
            </div>
          )}
          {notes && <p className="confirm-notes">{notes}</p>}
          {editing ? (
            <div className="inline-edit">
              <input
                aria-label="Edit molecular name or SMILES"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!value.trim() || busy}
                onClick={() => void resolve({ text: value })}
              >
                Recheck identity
              </Button>
            </div>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setValue(subject.components[0].smiles ?? subject.title);
                setEditing(true);
              }}
            >
              <Pencil size={14} />
              Edit name or SMILES
            </button>
          )}
          <div className="confirm-action">
            <Button onClick={() => void convene()} disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}Looks right
              · Convene the jury
              <ArrowRight size={17} />
            </Button>
            <small>
              <ShieldCheck size={13} /> Scientific evidence is gathered after confirmation.
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}

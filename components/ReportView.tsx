'use client';
import { useState } from 'react';
import type { Dossier, FinalVerdict, Turn } from '@/lib/types';
import { AnalysisReport, CitationDraft, Suggestions } from './AnalysisReport';
import { FinalAssessmentCard } from './FinalAssessmentCard';
import { Viewer3D } from './Viewer3D';
import { Mol2D } from './Mol2D';
import { EvidenceLedger } from './EvidenceLedger';
import { Bubble } from './Bubble';

export function ReportView({ dossier, verdict, turns, archived = false }: {
  dossier: Dossier; verdict: FinalVerdict; turns: Turn[]; archived?: boolean;
}) {
  const [view, setView] = useState<'result' | 'discussion' | 'evidence'>('result');
  const molecule = dossier.subject.components.find((component) => component.smiles);
  return <div className="report-view">
    {archived && <nav className="archived-view-tabs" aria-label="Saved project views">
      {(['result', 'discussion', 'evidence'] as const).map((item) =>
        <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
          {item === 'result' ? 'Final result' : item === 'discussion' ? `Agent discussion (${turns.length})` : `Evidence (${dossier.evidence.length})`}
        </button>)}
    </nav>}
    {view === 'discussion' ? <div className="saved-work-panel">
      <h2>Saved agent discussion</h2>
      <div className="report-transcript">{turns.map((turn, index) =>
        <Bubble key={index} turn={turn} animate={false} />)}</div>
    </div> : view === 'evidence' ? <div className="saved-work-panel">
      <EvidenceLedger dossier={dossier} />
    </div> : <>
      <div className="report-three-cards">
        <AnalysisReport dossier={dossier} verdict={verdict} />
        <section className="report-structure-card" aria-label="Component structure">
          <span className="eyebrow">02 · STRUCTURE</span>
          <Viewer3D dossier={dossier} />
          {molecule?.smiles && <div className="report-chemical-structure">
            <strong>2D connectivity · {molecule.name}</strong>
            <Mol2D smiles={molecule.smiles} />
          </div>}
          {dossier.subject.kind !== 'general_research' &&
            <p className="structure-accuracy-note">Structure provenance is shown in the viewer. Computed conformers and predictions are labeled.</p>}
        </section>
        <FinalAssessmentCard dossier={dossier} verdict={verdict} />
      </div>
      <Suggestions dossier={dossier} verdict={verdict} />
      <CitationDraft dossier={dossier} verdict={verdict} />
    </>}
  </div>;
}

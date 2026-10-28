'use client';
import { Scale, ShieldCheck } from 'lucide-react';
import type { Dossier, FinalVerdict } from '@/lib/types';
import { PercentBar } from './PercentBar';

const labels: Record<string, string> = {
  evidence_support: 'Evidence support',
  use_case_fit: 'Use case fit',
  liability: 'Supported liability',
};

export function FinalAssessmentCard({ dossier, verdict }: { dossier: Dossier; verdict: FinalVerdict }) {
  const decision = verdict.decision;
  return <section className="live-card final-assessment-card" aria-label="Decision API final assessment" data-call={verdict.call}>
    <div className="panel-heading">
      <span><Scale size={16} /> 03 · FINAL ASSESSMENT</span>
      <span className="decision-api-badge">{decision ? 'DECISION API' : 'SAVED RESULT'}</span>
    </div>
    <div className="live-call">
      <span className="eyebrow">{decision?.model ?? 'Historical assessment'}</span>
      <strong data-call={verdict.call}>{verdict.call.replace('_', '-')}</strong>
      <p>{decision ? 'Final research decision based on the case, sources, and jury discussion.' : 'This older run has no Decision API record.'}</p>
    </div>
    <PercentBar votes={verdict.percent} />
    <div className="confidence-grid">
      <div><span>Decision confidence</span><strong>{Math.round((decision?.confidence ?? verdict.confidence / 100) * 100)}<small>%</small></strong></div>
      <div><span>Evidence grade</span><strong className="grade-value">{verdict.evidenceGrade}</strong></div>
    </div>
    <div className="coverage-row">
      <span>Structured evidence coverage</span><strong>{dossier.coverage}%</strong>
      <div><i style={{ width: `${dossier.coverage}%` }} /></div>
    </div>
    {!!decision && <div className="assessment-metrics">
      {Object.entries(decision.metrics ?? {}).map(([key, metric]) =>
        <div className="assessment-metric" key={key}>
          <span>{labels[key] ?? key}</span>
          <strong>{metric.score.toFixed(2)} <small>/ 3</small></strong>
          <div><i style={{ width: `${(metric.score / 3) * 100}%` }} /></div>
        </div>)}
    </div>}
    <div className="verified-row"><ShieldCheck size={15} /><span>Citation IDs checked</span><strong>{verdict.citationsVerified}</strong></div>
    <p className="assessment-note">Choice bars and scores are model judgments for research triage, not clinical outcome probabilities.</p>
    {decision && <p className="assessment-id">Decision ID: {decision.id ?? decision.requestId ?? 'not supplied'}</p>}
  </section>;
}

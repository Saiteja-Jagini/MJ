'use client';
import type { Decision } from '@/lib/types';

const metricLabels: Record<string, string> = {
  evidence_support: 'Evidence support',
  use_case_fit: 'Use case fit',
  liability: 'Supported liability',
};

export function DecisionDetails({ decision }: { decision?: Decision }) {
  if (!decision) return null;
  return <section className="decision-details report-decision-details" aria-label="Decision API response">
    <div className="panel-heading">
      <span>Decision API response</span>
      <span className="small-label">{decision.model}</span>
    </div>
    <p className="decision-answer">
      <strong>{decision.choice.replace('_', '-')}</strong>
      <span>{Math.round(decision.confidence * 100)}% decision confidence</span>
    </p>
    <div className="decision-metrics">
      {Object.entries(decision.metrics ?? {}).map(([key, metric]) =>
        <div key={key}>
          <span>{metricLabels[key] ?? key}</span>
          <strong>{metric.score.toFixed(2)} <small>/ 3</small></strong>
          <small>{Math.round(metric.confidence * 100)}% confidence</small>
        </div>)}
    </div>
    <p className="decision-api-meta">
      Decision ID: {decision.id ?? 'not supplied'} · Evaluated {new Date(decision.evaluatedAt).toLocaleString()}.
      Scores are research judgments, not clinical probabilities.
    </p>
  </section>;
}

'use client';
import {
  Check,
  TriangleAlert,
  OctagonX,
  ArrowRight,
  ClipboardCheck,
  ShieldAlert,
  FlaskConical,
} from 'lucide-react';
import type { FinalVerdict } from '@/lib/types';
export function VerdictPanel({ verdict }: { verdict: FinalVerdict }) {
  const Icon =
    verdict.call === 'GO' ? Check : verdict.call === 'CAUTION' ? TriangleAlert : OctagonX;
  const top =
    verdict.percent[verdict.call === 'GO' ? 'go' : verdict.call === 'CAUTION' ? 'caution' : 'nogo'];
  return (
    <section className="verdict-panel" data-call={verdict.call}>
      <div className="verdict-banner">
        <div className="verdict-symbol">
          <Icon size={27} />
        </div>
        <div>
          <span className="eyebrow">THE JURY HAS REACHED A VERDICT</span>
          <h2>
            {verdict.call.replace('_', '-')}
            <span>{top}%</span>
          </h2>
          <p>{verdict.headline}</p>
        </div>
        <div className="verdict-grade">
          <span>EVIDENCE GRADE</span>
          <strong>{verdict.evidenceGrade}</strong>
          <small>{verdict.evidenceCoverage}% coverage</small>
        </div>
      </div>
      {verdict.evidenceCoverage < 20 && (
        <div className="insufficient">
          <TriangleAlert size={16} />
          INSUFFICIENT EVIDENCE · This verdict rests on very limited coverage.
        </div>
      )}
      <div className="verdict-details">
        {[
          { label: 'The reasoning', icon: ClipboardCheck, items: verdict.reasons },
          { label: 'Risks to consider', icon: ShieldAlert, items: verdict.risks },
          { label: 'What to do next', icon: FlaskConical, items: verdict.nextSteps },
        ].map((s) => (
          <div key={s.label}>
            <h3>
              <s.icon size={17} />
              {s.label}
            </h3>
            <ol>
              {s.items.map((x, i) => (
                <li key={i}>
                  <span>
                    {s.label === 'What to do next' ? (
                      <ArrowRight size={13} />
                    ) : (
                      String(i + 1).padStart(2, '0')
                    )}
                  </span>
                  {x}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="verdict-footnote">
        {verdict.decision
          ? `Decided by OpenAI Decisions (${verdict.decision.model}). Percentages show its choice distribution, not clinical outcome probabilities. Request: ${verdict.decision.requestId ?? verdict.decision.id ?? 'identifier not supplied'}`
          : 'Legacy weighted jury result (before Decisions API integration). Percentages are not clinical outcome probabilities.'}
      </p>
    </section>
  );
}

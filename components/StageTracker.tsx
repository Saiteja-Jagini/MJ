'use client';
import { Check, LoaderCircle } from 'lucide-react';
import type { Stage } from '@/lib/types';
const stages = [
  { key: 'confirm', label: 'Identify' },
  { key: 'dossier', label: 'Evidence' },
  { key: 'round1', label: 'Round one' },
  { key: 'crossexam', label: 'Cross-exam' },
  { key: 'rebuttal', label: 'Rebuttal' },
  { key: 'ruling', label: 'Ruling' },
];
export function StageTracker({ stage }: { stage: Stage }) {
  const at =
    stage === 'done'
      ? 6
      : Math.max(
          1,
          stages.findIndex((s) => s.key === stage),
        );
  return (
    <div className="stage-tracker" aria-label="Analysis progress">
      {stages.map((s, i) => (
        <div key={s.key} className={`${i < at ? 'complete' : ''} ${i === at ? 'active' : ''}`}>
          <span className="stage-node">
            {i < at ? (
              <Check size={11} />
            ) : i === at && stage !== 'error' ? (
              <LoaderCircle size={12} className="spin" />
            ) : (
              i + 1
            )}
          </span>
          <span>{s.label}</span>
          {i < stages.length - 1 && <i />}
        </div>
      ))}
    </div>
  );
}

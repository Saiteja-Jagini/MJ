'use client';
import { ArrowUpRight, Focus, Scale } from 'lucide-react';
import type { Driver } from '@/lib/types';
import { useJury } from '@/lib/store';
export function WhyPanel({ drivers, onExplore }: { drivers: Driver[]; onExplore?: () => void }) {
  const active = useJury((s) => s.activeAnchor);
  return (
    <section className="why-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">FOLLOW THE EVIDENCE</span>
          <h2>What moved the verdict?</h2>
        </div>
        <span className="subtle">
          <Focus size={14} /> Select a structural driver to explore it
        </span>
      </div>
      <div className="driver-list">
        {drivers.map((d, i) => (
          <button
            key={`${d.label}-${i}`}
            className={`driver-row ${d.anchorId && active === d.anchorId ? 'active' : ''}`}
            onClick={() => {
              if (d.anchorId) {
                useJury.getState().focus(d.anchorId);
                onExplore?.();
              } else if (d.evidenceIds[0])
                document
                  .getElementById(`evidence-${d.evidenceIds[0]}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <span className="driver-icon">
              {d.anchorId ? <Focus size={16} /> : <Scale size={16} />}
            </span>
            <span className="driver-label">
              {d.label}
              <small>
                Toward {d.toward.replace('_', '-')}
                {d.anchorId ? ' · structural evidence' : ' · dossier evidence'}
              </small>
            </span>
            <span className="driver-meter">
              <i
                style={{
                  width: `${Math.min(100, (Math.abs(d.delta) / 30) * 100)}%`,
                  background:
                    d.toward === 'GO'
                      ? 'var(--go)'
                      : d.toward === 'CAUTION'
                        ? 'var(--caution)'
                        : 'var(--nogo)',
                }}
              />
            </span>
            <span
              className="driver-weight"
              style={{
                color:
                  d.toward === 'GO'
                    ? 'var(--go)'
                    : d.toward === 'CAUTION'
                      ? 'var(--caution)'
                      : 'var(--nogo)',
              }}
            >
              {d.delta > 0 ? '+' : ''}
              {d.delta}
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
      <p className="micro-note">
        Driver values are rule weights, not percentage-point or causal effects.
      </p>
    </section>
  );
}

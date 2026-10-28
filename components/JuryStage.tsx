'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { AGENTS } from './agents';
import { roles, type Role, type Turn } from '@/lib/types';

export function JuryStage({
  thinking,
  turns,
  ruling,
  overview = false,
  onAgentClick,
  children,
}: {
  thinking: Role[];
  turns: Turn[];
  ruling: boolean;
  overview?: boolean;
  onAgentClick?: (role: Role) => void;
  children?: ReactNode;
}) {
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    const key = overview ? 'mj-overview-entry' : 'mj-analysis-entry';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const start = window.setTimeout(() => setEntering(true), 40);
    const end = window.setTimeout(() => setEntering(false), 3300);
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [overview]);
  const latest = turns.at(-1);
  const speaker = thinking.at(-1) ?? latest?.role ?? 'chair';
  const line = thinking.length
    ? `${AGENTS[speaker].name} is reviewing the evidence…`
    : (latest?.say ?? 'The five reviewers are taking their seats.');
  return (
    <section
      className={`jury-stage ${ruling ? 'is-ruling' : ''} ${overview ? 'jury-stage-overview' : ''} ${entering ? 'is-entering' : ''}`}
      aria-label="Five agent discussion"
    >
      <div className="jury-stage-heading">
        <span className="eyebrow">THE JURY CHAMBER</span>
        <span>
          {overview
            ? 'MEET THE FIVE REVIEWERS'
            : ruling
              ? 'RULING'
              : thinking.length
                ? 'LIVE DISCUSSION'
                : 'DISCUSSION'}
        </span>
      </div>
      <div className="jury-room">
        <div className="jury-table">
          <span>MOLECULEJURY</span>
        </div>
        {roles.map((role) => {
          const agent = AGENTS[role];
          const active = thinking.includes(role) || (!thinking.length && latest?.role === role);
          return (
            <div
              className={`jury-figure jury-figure-${role} ${active ? 'active' : ''}`}
              key={role}
              style={{ '--agent-color': agent.color } as React.CSSProperties}
              role={onAgentClick ? 'button' : undefined}
              tabIndex={onAgentClick ? 0 : undefined}
              aria-label={onAgentClick ? `About ${agent.name}, ${agent.discipline}` : undefined}
              onClick={() => onAgentClick?.(role)}
              onKeyDown={(event) => {
                if (onAgentClick && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  onAgentClick(role);
                }
              }}
            >
              <div className="jury-chair" aria-hidden="true">
                <div className="jury-chair-back" />
                <div className="jury-chair-seat" />
                <div className="jury-chair-arm left" />
                <div className="jury-chair-arm right" />
                <div className="jury-chair-leg left" />
                <div className="jury-chair-leg right" />
              </div>
              <div className="jury-avatar" aria-hidden="true">
                <div className="jury-hair" />
                <div className="jury-head">
                  <i />
                  <i />
                </div>
                <div className="jury-torso">
                  <agent.icon size={17} strokeWidth={2.5} />
                </div>
                <div className="jury-arm left" />
                <div className="jury-arm right" />
                <div className="jury-leg left" />
                <div className="jury-leg right" />
                <div className="jury-foot left" />
                <div className="jury-foot right" />
                {role === 'chair' && (
                  <div className="jury-gavel">
                    <b />
                  </div>
                )}
              </div>
              <div className="jury-name">
                <strong>{agent.name}</strong>
                {!overview && <small>{agent.discipline}</small>}
              </div>
            </div>
          );
        })}
      </div>
      {!overview && (
        <div className="jury-dialogue" aria-live="polite">
          <span className="jury-dialogue-name">
            {AGENTS[speaker].name} · {AGENTS[speaker].discipline}
          </span>
          <p key={line}>
            {ruling ? 'The evidence has been weighed. The decision is ready.' : line}
          </p>
        </div>
      )}
      {children && <div className="jury-stage-details">{children}</div>}
    </section>
  );
}

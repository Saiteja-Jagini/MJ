'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { Turn } from '@/lib/types';
import { AGENTS } from './agents';
import { useJury } from '@/lib/store';
export function Bubble({
  turn,
  previous,
  animate = false,
}: {
  turn: Turn;
  previous?: Turn;
  animate?: boolean;
}) {
  const [count, setCount] = useState(animate ? 0 : turn.say.length);
  const a = AGENTS[turn.role];
  useEffect(() => {
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(
      () =>
        setCount((c) => {
          if (c >= turn.say.length) {
            clearInterval(id);
            return c;
          }
          return c + 3;
        }),
      25,
    );
    return () => clearInterval(id);
  }, [animate, turn.say]);
  const visible = animate ? count : turn.say.length;
  const changed =
    previous &&
    (['go', 'caution', 'nogo'] as const).some((k) => Math.abs(turn[k] - previous[k]) >= 10);
  return (
    <article
      className={`bubble ${turn.round === 'rebuttal' ? 'rebuttal-bubble' : ''}`}
      style={{ '--agent-color': a.color } as React.CSSProperties}
    >
      <div className="bubble-top">
        <span className="agent-avatar">
          <a.icon size={17} />
        </span>
        <div>
          <strong>{a.name}</strong>
          <span>{turn.round === 'rebuttal' ? 'Rebuttal' : a.discipline}</span>
        </div>
        <span className="bubble-confidence">
          {Math.round(turn.confidence)}%<small>confidence</small>
        </span>
      </div>
      {changed && (
        <div className="changed-mind">
          <RefreshCw size={12} />
          Changed assessment{' '}
          <span>
            GO {previous.go} → {turn.go}%
          </span>
        </div>
      )}
      <p
        className="bubble-statement"
        onClick={() => setCount(turn.say.length)}
        onKeyDown={(e) => {
          if (e.code === 'Space') {
            e.preventDefault();
            setCount(turn.say.length);
          }
        }}
        tabIndex={visible < turn.say.length ? 0 : undefined}
        role={visible < turn.say.length ? 'button' : undefined}
        aria-label={visible < turn.say.length ? 'Show full statement' : undefined}
      >
        {turn.say.slice(0, visible)}
        {visible < turn.say.length && <span className="type-cursor" />}
      </p>
      <div className="bubble-bottom">
        <div className="citation-chips">
          {turn.cites.map((id) => (
            <button
              key={id}
              onClick={() => {
                const e = document.getElementById(`evidence-${id}`);
                e?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                e?.focus();
              }}
            >
              {id}
              <ArrowUpRight size={10} />
            </button>
          ))}
        </div>
        <div className="tiny-votes">
          <span>
            {turn.go}
            <small>GO</small>
          </span>
          <span>
            {turn.caution}
            <small>CAUTION</small>
          </span>
          <span>
            {turn.nogo}
            <small>NO-GO</small>
          </span>
        </div>
      </div>
      {turn.anchor !== 'none' && (
        <button className="bubble-focus" onClick={() => useJury.getState().focus(turn.anchor)}>
          Explore structural evidence <ArrowUpRight size={12} />
        </button>
      )}
    </article>
  );
}

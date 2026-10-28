'use client';
import { motion } from 'motion/react';
import type { Votes } from '@/lib/types';
export function PercentBar({ votes, compact = false }: { votes: Votes; compact?: boolean }) {
  const items = [
    { key: 'go' as const, label: 'GO', color: '#6bd6ac' },
    { key: 'caution' as const, label: 'CAUTION', color: '#e8bf6d' },
    { key: 'nogo' as const, label: 'NO-GO', color: '#ee8799' },
  ];
  return (
    <div className={`percent-bars ${compact ? 'compact' : ''}`}>
      {items.map((i) => (
        <div className="percent-row" key={i.key}>
          <div>
            <span>
              <i style={{ background: i.color }} />
              {i.label}
            </span>
            <strong>
              {votes[i.key]}
              <small>%</small>
            </strong>
          </div>
          <div className="percent-track">
            <motion.div
              initial={false}
              animate={{ width: `${votes[i.key]}%` }}
              transition={{ duration: 0.5 }}
              style={{ background: i.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';
import { LoaderCircle, Check, RefreshCw } from 'lucide-react';
import type { Role } from '@/lib/types';
import { AGENTS } from './agents';
export function Seat({
  role,
  thinking,
  spoken,
  error,
  onRetry,
}: {
  role: Role;
  thinking: boolean;
  spoken: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const a = AGENTS[role];
  return (
    <div
      className={`seat ${thinking ? 'thinking' : ''} ${spoken ? 'spoken' : ''}`}
      style={{ '--agent-color': a.color } as React.CSSProperties}
    >
      <span className="agent-avatar">
        <a.icon size={19} />
      </span>
      <div>
        <strong>{a.name}</strong>
        <small>
          {error
            ? 'Needs a retry'
            : thinking
              ? 'Considering evidence…'
              : spoken
                ? 'Assessment delivered'
                : a.discipline}
        </small>
      </div>
      {error ? (
        <button onClick={onRetry} title={error} aria-label={`Retry ${a.name}`}>
          <RefreshCw size={15} />
        </button>
      ) : thinking ? (
        <LoaderCircle size={15} className="spin" />
      ) : spoken ? (
        <Check size={14} />
      ) : (
        <span className="seat-waiting" />
      )}
    </div>
  );
}

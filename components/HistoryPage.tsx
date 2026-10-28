'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, Clock3, Search, Trash2 } from 'lucide-react';
import type { HistoryReference } from './AnalysisInput';

export interface SavedRun extends HistoryReference {
  kind: string;
  status: string;
  coverage: number;
  verdict: { call: string } | null;
}

export function HistoryPage({
  runs,
  loading,
  error,
  onOpen,
  onReference,
  onDelete,
  deletingId,
}: {
  runs: SavedRun[];
  loading: boolean;
  error: string;
  onOpen: (run: SavedRun) => void;
  onReference: (runs: HistoryReference[]) => void;
  onDelete: (run: SavedRun) => Promise<void>;
  deletingId: string | null;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = useMemo(
    () => runs.filter((run) => run.title.toLowerCase().includes(query.toLowerCase())),
    [runs, query],
  );
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 4
          ? [...current, id]
          : current,
    );
  return (
    <div className="history-page">
      <div className="history-page-head">
        <div>
          <span className="eyebrow">SAVED ANALYSES</span>
          <h1>History</h1>
          <p>Open a run to revisit its prompt, discussion, structure, evidence, and decision.</p>
        </div>
        <label className="history-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search analyses"
          />
        </label>
      </div>
      {!!selected.length && (
        <div className="history-reference-bar">
          <span>{selected.length} selected for context · up to four</span>
          <button onClick={() => onReference(runs.filter((run) => selected.includes(run.id)))}>
            Use in new analysis <ArrowRight size={16} />
          </button>
        </div>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading ? (
        <p>Loading saved analyses…</p>
      ) : filtered.length === 0 ? (
        <p>No saved analyses found.</p>
      ) : (
        <div className="history-page-list">
          {filtered.map((run) => {
            return (
              <div className="history-page-row" key={run.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(run.id)}
                  onChange={() => toggle(run.id)}
                  aria-label={`Use ${run.title} as context`}
                />
                <button onClick={() => onOpen(run)}>
                  <span>
                    <strong>{run.title}</strong>
                    <small>
                      <Clock3 size={12} /> {new Date(run.createdAt).toLocaleString()} ·{' '}
                      {run.kind.replace('_', ' ')} · {run.coverage}% coverage
                    </small>
                  </span>
                  <span className="history-row-end">
                    <em data-call={run.verdict?.call}>
                      {run.verdict?.call?.replace('_', '-') ?? run.status}
                    </em>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button
                  className="history-delete"
                  aria-label={`Delete ${run.title}`}
                  title="Delete saved analysis"
                  disabled={deletingId === run.id}
                  onClick={() => {
                    setSelected((current) => current.filter((id) => id !== run.id));
                    void onDelete(run);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

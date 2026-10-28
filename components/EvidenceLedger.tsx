'use client';
import { useState } from 'react';
import { BookOpen, ArrowUpRight, Search, Database, TriangleAlert } from 'lucide-react';
import type { Dossier } from '@/lib/types';
export function EvidenceLedger({ dossier }: { dossier: Dossier }) {
  const [filter, setFilter] = useState('');
  const items = dossier.evidence.filter((e) =>
    `${e.source} ${e.text} ${e.id}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const missing = dossier.sources.filter((s) => s.status !== 'available');
  return (
    <section className="evidence-ledger" id="evidence-ledger">
      <div className="section-title">
        <div>
          <span className="eyebrow">TRACEABLE BY DESIGN</span>
          <h2>
            <BookOpen size={20} />
            Evidence ledger <span className="count-badge">{dossier.evidence.length}</span>
          </h2>
        </div>
        <label className="evidence-search">
          <Search size={15} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search the evidence"
            aria-label="Search evidence"
          />
        </label>
      </div>
      {missing.length > 0 && (
        <div className="source-notice">
          <TriangleAlert size={15} />
          <span>
            {missing.length} source lookups returned no usable data. Coverage reflects these gaps.
          </span>
          <details>
            <summary>View gaps</summary>
            {missing.map((s, i) => (
              <p key={i}>
                {s.name} ({s.componentKey}): {s.detail}
              </p>
            ))}
          </details>
        </div>
      )}
      <div className="ledger-list">
        {items.map((e) => (
          <article key={e.id} id={`evidence-${e.id}`} tabIndex={-1} className="evidence-row">
            <span className="evidence-id">{e.id}</span>
            <div>
              <div className="evidence-meta">
                <strong>{e.source}</strong>
                <span className={`quality-tag ${e.quality}`}>{e.quality}</span>
                <small>{e.kind.replaceAll('-', ' ')}</small>
              </div>
              <p>{e.text}</p>
              <small className="evidence-date">
                Retrieved {new Date(e.retrievedAt).toLocaleString()}
              </small>
            </div>
            {e.url ? (
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="source-link"
                aria-label={`Open source for ${e.id}`}
              >
                <ArrowUpRight size={17} />
              </a>
            ) : (
              <Database size={16} className="local-evidence" />
            )}
          </article>
        ))}
      </div>
      {items.length === 0 && <p className="empty-message">No matching evidence items.</p>}
    </section>
  );
}

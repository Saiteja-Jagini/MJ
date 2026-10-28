'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  FileCheck2,
  Database,
  ShieldCheck,
  Activity,
  MessageSquare,
  Box,
  Scale,
} from 'lucide-react';
import { useJury } from '@/lib/store';
import { roles } from '@/lib/types';
import { StageTracker } from './StageTracker';
import { Viewer3D } from './Viewer3D';
import { PercentBar } from './PercentBar';
import { Seat } from './Seat';
import { Bubble } from './Bubble';
import { WhyPanel } from './WhyPanel';
import { EvidenceLedger } from './EvidenceLedger';
import { VerdictPanel } from './VerdictPanel';
import { Button } from './ui/button';
export function Chamber() {
  const s = useJury();
  const [tab, setTab] = useState('debate');
  if (!s.subject) return null;
  const specialist = s.turns.filter(
    (t) => ['chemist', 'toxicologist', 'pharmacologist'].includes(t.role) && t.round === 'opening',
  );
  const mean = specialist.reduce((n, t) => n + t.nogo, 0) / (specialist.length || 1);
  const tension = Math.min(
    100,
    Math.round(
      Math.sqrt(
        specialist.reduce((n, t) => n + (t.nogo - mean) ** 2, 0) / (specialist.length || 1),
      ) * 2,
    ),
  );
  return (
    <div className="chamber-view">
      <div className="chamber-title">
        <div>
          <button className="text-button" onClick={s.reset}>
            <ArrowLeft size={14} />
            New analysis
          </button>
          <h1>{s.subject.title}</h1>
          <p>{s.subject.question}</p>
        </div>
        <span className={`session-status ${s.busy ? 'live' : ''}`}>
          <span />
          {s.busy ? 'JURY IN SESSION' : s.verdict ? 'DELIBERATION COMPLETE' : 'ANALYSIS SAVED'}
        </span>
      </div>
      <StageTracker stage={s.stage} />
      {!s.dossier ? (
        <div className="dossier-building">
          <div className="building-orbit">
            <Database size={30} />
            <span />
            <span />
            <span />
          </div>
          <span className="eyebrow">ASSEMBLING THE DOSSIER</span>
          <h2>Good judgment starts with good evidence.</h2>
          <p>Checking chemistry, consulting public databases, and preparing structural evidence.</p>
          <div className="building-sources">
            {[
              'RDKit chemistry',
              'PubChem & ChEMBL',
              'Protein databases',
              'Toxicity models',
              'Scientific literature',
            ].map((x, i) => (
              <span key={x} style={{ animationDelay: `${i * 0.3}s` }}>
                <LoaderCircle size={12} className="spin" />
                {x}
              </span>
            ))}
          </div>
          {s.error && (
            <div className="inline-error">
              {s.error}
              <Button size="sm" onClick={() => void s.convene()} disabled={s.busy}>
                Retry dossier
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mobile-tabs">
            {[
              { id: 'debate', label: 'Debate', icon: MessageSquare },
              { id: '3d', label: '3D explorer', icon: Box },
              { id: 'verdict', label: 'Verdict', icon: Scale },
            ].map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'selected' : ''}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>
          <div className={`chamber-grid mobile-${tab}`}>
            <div className="debate-column">
              <div className="panel-heading">
                <span>
                  <MessageSquare size={16} />
                  The discussion
                </span>
                <span className="small-label">{s.turns.length} TURNS</span>
              </div>
              <div className="seats">
                {roles.map((role) => (
                  <Seat
                    key={role}
                    role={role}
                    thinking={s.thinking.includes(role)}
                    spoken={s.turns.some((t) => t.role === role)}
                    error={s.errors[role]}
                    onRetry={() => {
                      if (!s.busy) void s.jury();
                    }}
                  />
                ))}
              </div>
              <div className="transcript">
                <div className="opening-note">
                  <span>GAVEL · OPENING THE CASE</span>
                  <p>
                    We are reviewing {s.subject.title}. The dossier contains{' '}
                    {s.dossier.evidence.length} evidence items with {s.dossier.coverage}% coverage.
                    Let’s examine what the evidence supports.
                  </p>
                </div>
                {s.turns.map((t, i) => (
                  <motion.div
                    key={`${t.role}-${i}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Bubble
                      turn={t}
                      previous={
                        t.round === 'rebuttal'
                          ? s.turns.find((x) => x.role === t.role && x.round === 'opening')
                          : undefined
                      }
                      animate={s.busy && i === s.turns.length - 1}
                    />
                  </motion.div>
                ))}
                {s.thinking.length > 0 && (
                  <div className="thinking-indicator">
                    <span />
                    <span />
                    <span />
                    The jury is considering the evidence
                  </div>
                )}
              </div>
            </div>
            <div className="structure-column">
              <Viewer3D dossier={s.dossier} />
              <div className="molecular-stats">
                {Object.entries(s.dossier.chemistry)
                  .slice(0, 1)
                  .map(([key, c]) => (
                    <div key={key}>
                      {[
                        { n: 'Molecular weight', v: c.mw?.toFixed(1), u: 'Da' },
                        { n: 'cLogP', v: c.logp?.toFixed(2), u: '' },
                        { n: 'TPSA', v: c.tpsa?.toFixed(1), u: 'Å²' },
                        { n: 'Lipinski flags', v: String(c.lipinskiViolations), u: '' },
                      ].map((x) => (
                        <div key={x.n}>
                          <span>{x.n}</span>
                          <strong>
                            {x.v ?? '—'}
                            <small>{x.u}</small>
                          </strong>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
              <div className="disagreement">
                <div>
                  <Activity size={15} />
                  <span>Specialist disagreement</span>
                  <strong>{tension}%</strong>
                </div>
                <div>
                  <i style={{ width: `${tension}%` }} />
                </div>
                <p>Different lenses reveal different questions.</p>
              </div>
            </div>
            <aside className="live-column">
              <div className="live-card">
                <div className="panel-heading">
                  <span>
                    <Scale size={16} />
                    {s.verdict ? 'Final assessment' : 'Live assessment'}
                  </span>
                  <span className="live-indicator" />
                </div>
                <div className="live-call">
                  <span className="eyebrow">
                    {s.verdict ? 'THE JURY’S VERDICT' : 'CURRENT DIRECTION'}
                  </span>
                  <strong data-call={s.live?.call}>
                    {s.live?.call.replace('_', '-') ?? 'REVIEWING'}
                  </strong>
                  <p>
                    {s.verdict
                      ? 'The evidence has been weighed.'
                      : 'An estimate. The discussion can change it.'}
                  </p>
                </div>
                {s.live && <PercentBar votes={s.live.percent} />}
                <div className="confidence-grid">
                  <div>
                    <span>Confidence</span>
                    <strong>
                      {s.live?.confidence ?? 0}
                      <small>%</small>
                    </strong>
                  </div>
                  <div>
                    <span>Evidence grade</span>
                    <strong className="grade-value">{s.live?.evidenceGrade ?? '—'}</strong>
                  </div>
                </div>
                <div className="coverage-row">
                  <span>Evidence coverage</span>
                  <strong>{s.dossier.coverage}%</strong>
                  <div>
                    <i style={{ width: `${s.dossier.coverage}%` }} />
                  </div>
                </div>
                <div className="verified-row">
                  <ShieldCheck size={15} />
                  <span>Citation IDs verified</span>
                  <strong>{s.live?.citationsVerified ?? '0/0'}</strong>
                </div>
                <p className="live-disclaimer">
                  Jury confidence, not a clinical probability. Source IDs are checked against this
                  dossier.
                </p>
              </div>
              <div className="dossier-summary">
                <FileCheck2 size={19} />
                <div>
                  <strong>{s.dossier.evidence.length} pieces of evidence</strong>
                  <p>
                    {s.dossier.sources.filter((x) => x.status === 'available').length} successful
                    source lookups
                  </p>
                </div>
                <button
                  aria-label="View evidence ledger"
                  onClick={() =>
                    document
                      .getElementById('evidence-ledger')
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  <ArrowRight size={17} />
                </button>
              </div>
              {s.subject.kind !== 'protein' && s.localChecks !== 'idle' && (
                <p className="micro-note">
                  {s.localChecks === 'verified'
                    ? 'Browser chemistry and fingerprint parity verified.'
                    : s.localChecks === 'checking'
                      ? 'Verifying local chemistry…'
                      : 'Browser checks unavailable; server-verified chemistry is shown.'}
                </p>
              )}
              {s.dossier.coverage < 20 && (
                <div className="warning-note">
                  Insufficient evidence. A strong verdict cannot compensate for missing data.
                </div>
              )}
            </aside>
          </div>
          {(s.error || s.errors.system) && (
            <div className="inline-error" role="alert">
              <span>{s.error ?? s.errors.system}</span>
              <Button size="sm" variant="secondary" disabled={s.busy} onClick={() => void s.jury()}>
                <RefreshCw size={14} />
                Resume jury
              </Button>
            </div>
          )}
          {s.verdict && <VerdictPanel verdict={s.verdict} />}
          <WhyPanel
            drivers={s.dossier.drivers}
            onExplore={() => {
              setTab('3d');
              requestAnimationFrame(() =>
                document
                  .querySelector('.viewer-panel')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
              );
            }}
          />
          <EvidenceLedger dossier={s.dossier} />
        </>
      )}
    </div>
  );
}

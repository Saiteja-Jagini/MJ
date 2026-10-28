'use client';
import { useEffect, useRef, useState } from 'react';
import { Database, FileCheck2, LoaderCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { useJury } from '@/lib/store';
import { AGENTS } from './agents';
import { Bubble } from './Bubble';
import { EvidenceLedger } from './EvidenceLedger';
import { JuryStage } from './JuryStage';
import { ReportView } from './ReportView';
import { Viewer3D } from './Viewer3D';
import { playGavelSound } from '@/lib/gavel-sound';
import { Button } from './ui/button';

export function Chamber({ archived = false }: { archived?: boolean }) {
  const s = useJury();
  const [report, setReport] = useState(Boolean(s.verdict));
  const [ruling, setRuling] = useState(false);
  const ceremonyDone = useRef(Boolean(s.verdict));
  const previousReport = useRef(report);

  useEffect(() => {
    if (!s.verdict || ceremonyDone.current) return;
    ceremonyDone.current = true;
    setRuling(true);
    playGavelSound();
    const timer = window.setTimeout(() => {
      setRuling(false);
      setReport(true);
    }, 1250);
    return () => window.clearTimeout(timer);
  }, [s.verdict]);
  useEffect(() => {
    if (report && !previousReport.current) {
      const timer = window.setTimeout(
        () => document.querySelector('.analysis-report')?.scrollIntoView({ behavior: 'smooth' }),
        120,
      );
      previousReport.current = report;
      return () => window.clearTimeout(timer);
    }
    previousReport.current = report;
  }, [report]);

  if (!s.subject) return null;
  if (archived && s.dossier) return <div className="chamber-view archived-project-view">
    {s.verdict ? <ReportView dossier={s.dossier} verdict={s.verdict} turns={s.turns} archived />
      : <div className="archived-incomplete">
        <h1>{s.subject.title}</h1>
        <p>{s.subject.userContext || s.subject.question}</p>
        <p>This saved analysis has no final decision.</p>
        <Viewer3D dossier={s.dossier} />
        <EvidenceLedger dossier={s.dossier} />
      </div>}
  </div>;

  return <div className="chamber-view">
    <div className="chamber-title">
      <div><h1>{s.subject.title}</h1><p>{s.subject.question}</p></div>
      <span className={`session-status ${s.busy ? 'live' : ''}`}>
        <span />{s.busy ? 'JURY IN SESSION' : s.verdict ? 'DELIBERATION COMPLETE' : 'ANALYSIS SAVED'}
      </span>
    </div>
    {!s.dossier ? <div className="dossier-building">
      <div className="building-orbit"><Database size={30} /><span /><span /><span /></div>
      <span className="eyebrow">ASSEMBLING THE DOSSIER</span>
      <h2>Reviewing the case and its evidence</h2>
      <p>{s.subject.kind === 'general_research'
        ? 'Reading the full question and current cited sources.'
        : 'Verifying components, structures, and relevant scientific records.'}</p>
      <div className="building-sources">
        {(s.subject.kind === 'general_research'
          ? ['Question and use case', 'Current cited sources', 'Limitations', 'Five reviewer lenses']
          : ['Molecular identity', 'Chemical or protein structure', 'Scientific records', 'Five reviewer lenses']
        ).map((item, index) => <span key={item} style={{ animationDelay: `${index * 0.3}s` }}>
          <LoaderCircle size={12} className="spin" />{item}
        </span>)}
      </div>
      {s.error && <div className="inline-error" role="alert">
        {s.error}
        <Button size="sm" onClick={() => void s.convene()} disabled={s.busy}>Retry dossier</Button>
      </div>}
    </div> : report && s.verdict ? <>
      <button className="text-button report-discussion-link" onClick={() => setReport(false)}>
        <MessageSquare size={15} /> View discussion
      </button>
      <ReportView dossier={s.dossier} verdict={s.verdict} turns={s.turns} />
    </> : <>
      {s.verdict && <button className="text-button report-discussion-link" onClick={() => setReport(true)}>
        <FileCheck2 size={15} /> View final result
      </button>}
      <JuryStage thinking={s.thinking} turns={s.turns} ruling={ruling} />
      <section className="discussion-only" aria-label="Agent dialogue">
        <div className="panel-heading"><span><MessageSquare size={16} /> Agent dialogue</span><span className="small-label">{s.turns.length} TURNS</span></div>
        {s.turns.map((turn, index) => <Bubble
          key={`${turn.role}-${index}`}
          turn={turn}
          animate={s.busy && index === s.turns.length - 1}
        />)}
        {s.thinking.length > 0 && <div className="thinking-indicator">
          <span /><span /><span />{AGENTS[s.thinking.at(-1)!].name} is considering the evidence
        </div>}
      </section>
      {(s.error || s.errors.system) && <div className="inline-error" role="alert">
        <span>{s.error ?? s.errors.system}</span>
        <Button size="sm" variant="secondary" disabled={s.busy} onClick={() => void s.jury()}>
          <RefreshCw size={14} /> Resume jury
        </Button>
      </div>}
    </>}
  </div>;
}

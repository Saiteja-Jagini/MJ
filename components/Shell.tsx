'use client';
import { useEffect, useState } from 'react';
import {
  Plus,
  History,
  BookOpen,
  ArrowUpRight,
  ChevronRight,
  FlaskConical,
  Layers,
  LoaderCircle,
} from 'lucide-react';
import { useJury } from '@/lib/store';
import { Brand } from './Brand';
import { DropZone } from './DropZone';
import { ConfirmCard } from './ConfirmCard';
import { Chamber } from './Chamber';
import { About } from './About';
import { Dialog } from './ui/dialog';
export function Shell() {
  const stage = useJury((s) => s.stage),
    subject = useJury((s) => s.subject),
    verdict = useJury((s) => s.verdict),
    busy = useJury((s) => s.busy);
  const [about, setAbout] = useState(false),
    [history, setHistory] = useState(false),
    [runs, setRuns] = useState<any[]>([]),
    [historyError, setHistoryError] = useState(''),
    [historyLoading, setHistoryLoading] = useState(false),
    [original, setOriginal] = useState<string | null>(null),
    [health, setHealth] = useState<{ database: boolean; ai: boolean; brain: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.dataset.verdict = verdict?.call ?? 'neutral';
  }, [verdict]);
  useEffect(() => {
    if (['idle', 'confirm', 'dossier'].includes(stage))
      window.scrollTo({ top: 0, behavior: 'instant' });
  }, [stage]);
  useEffect(
    () => () => {
      if (original) URL.revokeObjectURL(original);
    },
    [original],
  );
  useEffect(() => {
    if (!history) return;
    let alive = true;
    fetch('/api/runs')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (alive) setRuns(d.runs);
      })
      .catch((e) => {
        if (alive) setHistoryError(e.message);
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [history]);
  const reset = () => {
    useJury.getState().reset();
    setOriginal(null);
  };
  const showHistory = () => {
    setHistoryError('');
    setHistoryLoading(true);
    setHistory(true);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="sidebar-brand" onClick={reset} aria-label="MoleculeJury home">
          <Brand compact />
        </button>
        <div className="sidebar-main">
          <button
            className="rail-button active"
            onClick={reset}
            aria-label="New analysis"
            title="New analysis"
          >
            <Plus size={22} />
          </button>
          <button
            className="rail-button"
            onClick={showHistory}
            aria-label="Recent analyses"
            title="Recent analyses"
          >
            <History size={21} />
          </button>
          <button
            className="rail-button"
            onClick={() => setAbout(true)}
            aria-label="Methods and evidence"
            title="Methods and evidence"
          >
            <BookOpen size={20} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span
            className={`rail-status ${health?.database ? 'online' : ''}`}
            title={health?.database ? 'PostgreSQL connected' : 'Checking database'}
          />
          <span className="rail-version">V2</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Brand />
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {stage === 'idle' || stage === 'resolving'
                ? 'New analysis'
                : stage === 'confirm'
                  ? 'Confirm identity'
                  : 'Jury chamber'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <span
                className={health?.database && health?.ai ? 'status-dot' : 'status-dot pending'}
              />
              {health?.database && health?.ai
                ? 'Workspace ready'
                : health
                  ? 'Setup needs attention'
                  : 'Connecting workspace'}
            </span>
            <button className="about-link" onClick={() => setAbout(true)}>
              How it works
              <ArrowUpRight size={14} />
            </button>
            <span className="user-avatar">MJ</span>
          </div>
        </header>
        <main>
          {stage === 'idle' || stage === 'resolving' ? (
            <DropZone onImage={setOriginal} />
          ) : stage === 'confirm' ? (
            <ConfirmCard originalImage={original} />
          ) : subject ? (
            <Chamber />
          ) : (
            <div className="loading-page">
              <LoaderCircle className="spin" />
              Restoring analysis…
            </div>
          )}
        </main>
        <div className="mobile-bottom-nav">
          <button onClick={reset}>
            <Plus size={19} />
            Analyze
          </button>
          <button onClick={showHistory}>
            <History size={19} />
            History
          </button>
          <button onClick={() => setAbout(true)}>
            <BookOpen size={19} />
            Methods
          </button>
        </div>
      </div>
      <About open={about} onOpenChange={setAbout} />
      <Dialog
        open={history}
        onOpenChange={setHistory}
        title="Your recent investigations"
        description="Analyses saved to PostgreSQL for this browser session."
      >
        <div className="history-list">
          {historyLoading ? (
            <div className="empty-view">
              <LoaderCircle className="spin" />
              Loading saved analyses…
            </div>
          ) : historyError ? (
            <p className="inline-error">{historyError}</p>
          ) : runs.length === 0 ? (
            <div className="empty-view">
              <Layers size={35} />
              <strong>A clean slate.</strong>
              <span>Your completed and interrupted analyses will appear here.</span>
            </div>
          ) : (
            runs.map((r) => (
              <button
                key={r.id}
                disabled={busy}
                className="history-row"
                onClick={() => {
                  setHistory(false);
                  void useJury.getState().restore(r.id);
                }}
              >
                <span className="example-icon">
                  <FlaskConical size={19} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {new Date(r.createdAt).toLocaleString()} · {r.coverage}% evidence coverage
                  </small>
                </span>
                <span className="history-verdict" data-call={r.verdict?.call}>
                  {r.verdict?.call?.replace('_', '-') ?? r.status}
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          )}
        </div>
      </Dialog>
    </div>
  );
}

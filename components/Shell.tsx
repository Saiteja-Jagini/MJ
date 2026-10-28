'use client';
import { useEffect, useState } from 'react';
import { History, LoaderCircle, Plus, LayoutDashboard } from 'lucide-react';
import { useJury } from '@/lib/store';
import { Brand } from './Brand';
import { AnalysisInput, type HistoryReference } from './AnalysisInput';
import { Chamber } from './Chamber';
import { ReportView } from './ReportView';
import { Viewer3D } from './Viewer3D';
import { EvidenceLedger } from './EvidenceLedger';
import { Overview } from './Overview';
import { HistoryPage, type SavedRun } from './HistoryPage';
import { DossierSchema, FinalSchema, TurnSchema, type Dossier, type FinalVerdict, type Turn } from '@/lib/types';

type Page = 'overview' | 'analysis' | 'history';

export function Shell() {
  const stage = useJury((s) => s.stage);
  const subject = useJury((s) => s.subject);
  const dossier = useJury((s) => s.dossier);
  const verdict = useJury((s) => s.verdict);
  const runId = useJury((s) => s.runId);
  const [page, setPage] = useState<Page>('overview');
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyRun, setHistoryRun] = useState<SavedRun | null>(null);
  const [historyData, setHistoryData] = useState<{ dossier: Dossier; verdict: FinalVerdict | null; turns: Turn[] } | null>(null);
  const [references, setReferences] = useState<HistoryReference[]>([]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [analysisKey, setAnalysisKey] = useState(0);
  const [health, setHealth] = useState<{ database: boolean; ai: boolean; brain: boolean } | null>(
    null,
  );

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.dataset.verdict = verdict?.call ?? 'neutral';
  }, [verdict]);
  useEffect(() => {
    if (page !== 'history') return;
    let alive = true;
    fetch('/api/runs')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (alive) setRuns(data.runs);
      })
      .catch((error) => {
        if (alive) setHistoryError(error.message);
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page]);
  useEffect(() => {
    if (page !== 'analysis') return;
    if (dossier && !verdict) {
      const timer = window.setTimeout(
        () => document.querySelector('.jury-stage')?.scrollIntoView({ behavior: 'smooth' }),
        150,
      );
      return () => window.clearTimeout(timer);
    }
  }, [page, stage, dossier, verdict]);

  const showAnalysis = () => {
    setHistoryRun(null);
    setPage('analysis');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const showHistory = () => {
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryRun(null);
    setHistoryData(null);
    setPage('history');
    window.scrollTo(0, 0);
  };
  const openHistory = async (run: SavedRun) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch(`/api/runs/${run.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to open this project.');
      setHistoryData({
        dossier: DossierSchema.parse(data.dossier),
        verdict: data.verdict ? FinalSchema.parse(data.verdict) : null,
        turns: TurnSchema.array().parse(data.turns),
      });
      setHistoryRun(run);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to open this project.');
    } finally {
      setHistoryLoading(false);
    }
  };
  const deleteHistory = async (run: SavedRun) => {
    setDeletingId(run.id);
    setHistoryError('');
    try {
      const response = await fetch(`/api/runs/${run.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to delete this analysis.');
      setRuns((current) => current.filter((item) => item.id !== run.id));
      if (historyRun?.id === run.id) {
        setHistoryRun(null);
        setHistoryData(null);
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to delete this analysis.');
    } finally {
      setDeletingId(null);
    }
  };
  const referenceHistory = (items: HistoryReference[]) => {
    useJury.getState().reset();
    setDraft('');
    setAttachment(null);
    setReferences(items);
    setHistoryRun(null);
    setAnalysisKey((value) => value + 1);
    setPage('analysis');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="topbar-brand"
          onClick={() => {
            setPage('overview');
            window.scrollTo(0, 0);
          }}
          aria-label="MoleculeJury overview"
        >
          <Brand />
        </button>
        <nav className="topnav-actions" aria-label="Main navigation">
          <button
            className={`topnav-button ${page === 'overview' ? 'active' : ''}`}
            aria-label="Overview"
            onClick={() => {
              setPage('overview');
              window.scrollTo(0, 0);
            }}
          >
            <LayoutDashboard size={17} />
            <span>Overview</span>
          </button>
          <button
            className={`topnav-button ${page === 'analysis' ? 'active' : ''}`}
            aria-label="New analysis"
            onClick={showAnalysis}
          >
            <Plus size={18} />
            <span>New analysis</span>
          </button>
          <button
            className={`topnav-button ${page === 'history' ? 'active' : ''}`}
            aria-label="History"
            onClick={showHistory}
          >
            <History size={18} />
            <span>History</span>
          </button>
        </nav>
        <div className="topbar-right">
          <span className="system-status">
            <span
              className={health?.database && health?.ai ? 'status-dot' : 'status-dot pending'}
            />
            {health?.database && health?.ai
              ? 'Ready'
              : health
                ? 'Setup needs attention'
                : 'Connecting'}
          </span>
        </div>
      </header>
      <main className="app-main">
        {page === 'overview' ? (
          <Overview onStart={showAnalysis} />
        ) : page === 'history' && historyRun && historyData ? (
          <div className="history-project">
            <div className="history-breadcrumb">
              <button onClick={() => { setHistoryRun(null); setHistoryData(null); }}>History</button>
              <span>›</span>
              <strong>{historyRun.title}</strong>
            </div>
            <div className="history-project-meta">
              <span>{new Date(historyRun.createdAt).toLocaleString()}</span>
              <button onClick={() => referenceHistory([historyRun])}>Use as context in a new analysis</button>
            </div>
            {historyData.verdict ? (
              <ReportView dossier={historyData.dossier} verdict={historyData.verdict} turns={historyData.turns} archived />
            ) : (
              <div className="archived-incomplete">
                <h1>{historyData.dossier.subject.title}</h1>
                <p>{historyData.dossier.subject.userContext || historyData.dossier.subject.question}</p>
                <p>This saved analysis has no final decision.</p>
                <Viewer3D dossier={historyData.dossier} />
                <EvidenceLedger dossier={historyData.dossier} />
              </div>
            )}
          </div>
        ) : page === 'history' ? (
          <HistoryPage
            runs={runs}
            loading={historyLoading}
            error={historyError}
            onOpen={(run) => void openHistory(run)}
            onReference={referenceHistory}
            onDelete={deleteHistory}
            deletingId={deletingId}
          />
        ) : (
          <div className="analysis-page">
            <AnalysisInput
              key={analysisKey}
              value={draft}
              onChange={setDraft}
              file={attachment}
              onFileChange={setAttachment}
              references={references}
              onRemoveReference={(id) =>
                setReferences((items) => items.filter((item) => item.id !== id))
              }
            />
            <div id="analysis-flow">
              {subject ? (
                <Chamber key={runId ?? subject.id} />
              ) : stage === 'resolving' ? (
                <div className="loading-page">
                  <LoaderCircle className="spin" /> Identifying input…
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

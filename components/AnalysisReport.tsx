'use client';
import type { Dossier, FinalVerdict } from '@/lib/types';

function citedText(value: string, dossier: Dossier) {
  return value.split(/(E\d+)/g).map((part, index) => {
    if (!/^E\d+$/.test(part)) return part;
    const evidence = dossier.evidence.find((item) => item.id === part);
    return evidence?.url
      ? <a key={index} href={evidence.url} target="_blank" rel="noreferrer">[{part}]</a>
      : <span key={index}>[{part}]</span>;
  });
}

export function AnalysisReport({ dossier, verdict }: { dossier: Dossier; verdict: FinalVerdict }) {
  const context = dossier.subject.analysisContext;
  return <section className="analysis-report review-card" aria-label="Brief review">
    <span className="eyebrow">01 · BRIEF REVIEW</span>
    <h2>{verdict.headline}</h2>
    <p className="review-question">{dossier.subject.question}</p>
    {(context?.useCase || context?.issue) && <div className="review-context">
      {context.useCase && <p><b>Use case</b>{context.useCase}</p>}
      {context.issue && <p><b>Issue</b>{context.issue}</p>}
    </div>}
    <div className="review-points">
      <h3>Why this decision</h3>
      <ul>{verdict.reasons.slice(0, 2).map((reason, index) =>
        <li key={index}>{citedText(reason, dossier)}</li>)}</ul>
    </div>
    <div className="review-points review-limits">
      <h3>Main limitation</h3>
      <p>{citedText(verdict.risks[0] ?? 'The available evidence is limited for this exact use case.', dossier)}</p>
      {dossier.subject.kind === 'general_research' &&
        <small>No molecular component was verified for a structure view.</small>}
    </div>
  </section>;
}

export function Suggestions({ dossier, verdict }: { dossier: Dossier; verdict: FinalVerdict }) {
  return <section className="report-suggestions-card" aria-label="Suggestions">
    <div><span className="eyebrow">NEXT</span><h3>Suggested checks</h3></div>
    <ol>{verdict.nextSteps.slice(0, 3).map((step, index) =>
      <li key={index}>{citedText(step, dossier)}</li>)}</ol>
  </section>;
}

export function CitationDraft({ dossier, verdict }: { dossier: Dossier; verdict: FinalVerdict }) {
  const chair = verdict.transcript.find((turn) => turn.role === 'chair');
  const ids = [...new Set([
    ...[verdict.headline, ...verdict.reasons, ...verdict.nextSteps].flatMap((line) => line.match(/E\d+/g) ?? []),
    ...(chair?.cites ?? []),
    ...verdict.drivers.flatMap((driver) => driver.evidenceIds),
  ])];
  const citations = ids.map((id) => dossier.evidence.find((item) => item.id === id))
    .filter((item) => item?.url).slice(0, 8);
  return <section className="report-citation-list" aria-label="Citations">
    <div><span className="eyebrow">SOURCES</span><h3>Citations</h3></div>
    {citations.length ? <ol>{citations.map((item) =>
      <li key={item!.id}><a href={item!.url} target="_blank" rel="noreferrer">
        [{item!.id}] {item!.source}
      </a></li>)}</ol>
      : <p>No linked source was returned for this run.</p>}
    <small>Check the original sources before reusing these citations.</small>
  </section>;
}

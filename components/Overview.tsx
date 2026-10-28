'use client';
import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { AGENTS } from './agents';
import { JuryStage } from './JuryStage';
import type { Role } from '@/lib/types';

const specifications: Record<Role, string[]> = {
  chemist: [
    'Validated molecular identity and composition',
    'Physicochemical properties and structural alerts',
    'Structure-linked evidence and similarity limits',
  ],
  toxicologist: [
    'Safety signals and model applicability',
    'Measured liabilities versus predicted alerts',
    'Exposure, reporting, and missing safety data',
  ],
  pharmacologist: [
    'Measured activity and target relevance',
    'Selectivity and evidence for the stated use case',
    'Experiments that could establish target engagement',
  ],
  skeptic: [
    'Challenges the strongest specialist claim',
    'Checks contradictions and source quality',
    'Names the experiment that could change the conclusion',
  ],
  chair: [
    'Explains the Decision API verdict',
    'Connects the decision to cited evidence',
    'Summarizes limitations and next steps',
  ],
};

export function Overview({ onStart }: { onStart: () => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const agent = selected ? AGENTS[selected] : null;
  return (
    <div className="overview-page">
      <div className="overview-intro">
        <span className="eyebrow">THE PROBLEM</span>
        <h1>A research decision is only as clear as its evidence.</h1>
        <p>
          Molecular identity, assay results, safety signals, and missing data are often scattered.
          MoleculeJury brings them into one review of your specific question, with five distinct
          scientific lenses and a traceable decision.
        </p>
      </div>
      <JuryStage thinking={[]} turns={[]} ruling={false} overview onAgentClick={setSelected}>
        {agent && selected && (
          <section className="overview-agent-panel" aria-label={`${agent.name} specifications`}>
            <button
              className="overview-agent-close"
              onClick={() => setSelected(null)}
              aria-label="Close agent details"
            >
              <X size={17} />
            </button>
            <span className="eyebrow">{agent.discipline}</span>
            <h2>{agent.name}</h2>
            <p>{agent.description}</p>
            <ul>
              {specifications[selected].map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        )}
      </JuryStage>
      <section className="overview-capabilities" aria-label="Application capabilities">
        <div><span>01</span><h2>Understand the case</h2><p>Separate the question, use case, reported observations, and verified molecular components.</p></div>
        <div><span>02</span><h2>Check the evidence</h2><p>Combine structure analysis, public scientific records, current cited web findings, and five reviewer lenses.</p></div>
        <div><span>03</span><h2>Make the decision clear</h2><p>Show a Decision API verdict, uncertainty, source links, an accurate visual, and concrete next checks.</p></div>
      </section>
      <button className="overview-start" onClick={onStart}>
        New analysis <ArrowRight size={17} />
      </button>
    </div>
  );
}

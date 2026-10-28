import { describe, it, expect } from 'vitest';
import { evidenceFor, turnPrompt } from '../lib/ai/prompts';
import type { Dossier } from '../lib/types';
const dossier = {
  subject: {
    title: 'Example',
    kind: 'protein',
    question: 'Tractable?',
    components: [
      {
        key: 'c0',
        role: 'target',
        name: 'Target',
        pdbText: 'PRIVATE_COORDINATES',
        sequence: 'PRIVATE_SEQUENCE',
      },
    ],
  },
  evidence: [
    {
      id: 'E1',
      domains: ['chemist'],
      source: 'RDKit',
      quality: 'heuristic',
      text: 'Chemistry alert',
    },
    {
      id: 'E2',
      domains: ['pharmacologist'],
      source: 'ChEMBL',
      quality: 'measured',
      text: 'Measured activity',
    },
    { id: 'E3', domains: ['all'], source: 'Dossier', quality: 'annotation', text: 'Overview' },
  ],
  anchors: [
    { id: 'c0:alert:herg', label: 'hERG-liability alert' },
    { id: 'c0:overview', label: 'Overview' },
  ],
  prior: { go: 34, caution: 33, nogo: 33 },
  drivers: [],
} as unknown as Dossier;
describe('specialist context boundaries', () => {
  it('gives each specialist only its domain evidence', () => {
    expect(evidenceFor('pharmacologist', dossier).map((e) => e.id)).toEqual(['E2', 'E3']);
    expect(evidenceFor('skeptic', dossier)).toHaveLength(3);
  });
  it('does not leak chemistry alerts through anchor labels', () => {
    expect(turnPrompt('pharmacologist', dossier, [])).not.toContain('hERG');
  });
  it('never sends uploaded protein contents or full sequences to the model', () => {
    const prompt = turnPrompt('chair', dossier, []);
    expect(prompt).not.toContain('PRIVATE_COORDINATES');
    expect(prompt).not.toContain('PRIVATE_SEQUENCE');
  });
});

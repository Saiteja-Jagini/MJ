import { describe, expect, it } from 'vitest';
import { isResearchQuestion } from '../lib/ai/research-input';

describe('research question intake', () => {
  it('routes scientific prose to the extraction path', () => {
    expect(
      isResearchQuestion('We found imatinib active against ABL1 in one assay. Should it advance?'),
    ).toBe(true);
    expect(isResearchQuestion('Is EGFR a safe target for this use case?')).toBe(true);
    expect(isResearchQuestion('is imatinib safe')).toBe(true);
    expect(isResearchQuestion('I found an imatinib hit')).toBe(true);
  });
  it('retains direct structure and composition intake', () => {
    expect(isResearchQuestion('terfenadine')).toBe(false);
    expect(isResearchQuestion('paracetamol 500mg + caffeine 65mg')).toBe(false);
    expect(isResearchQuestion('>protein\nMALWMRLLPLLALLALWGPGPG')).toBe(false);
  });
});

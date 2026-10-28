import type { Alert } from '../types';

export const ALERTS: Alert[] = [
  { id: 'nitro_arom', label: 'Aromatic nitro', smarts: 'c[N+](=O)[O-]', severity: 'danger', why: 'Nitroaromatics can be bioreduced to reactive, mutagenic species.' },
  { id: 'michael', label: 'Michael acceptor (enone)', smarts: '[CX3]=[CX3][CX3]=O', severity: 'warn', why: 'Electrophile that can covalently modify proteins.' },
  { id: 'tzd', label: 'Thiazolidinedione ring', smarts: 'O=C1NC(=O)SC1', severity: 'warn', why: 'TZD class: PPARγ pharmacophore, also linked to fluid-retention and liver flags.' },
  { id: 'catechol', label: 'Catechol', smarts: '[OX2H]c:c[OX2H]', severity: 'danger', why: 'Redox-cycles to reactive quinones; frequent PAINS motif.' },
  { id: 'ene_rhodanine', label: 'Ene-rhodanine', smarts: 'O=C1NC(=S)SC1=[#6]', severity: 'danger', why: 'Classic PAINS: promiscuity and assay interference.' },
  { id: 'aniline', label: 'Free aniline', smarts: '[NX3;H2]c', severity: 'warn', why: 'Can be metabolically activated to reactive intermediates.' },
  { id: 'epoxide', label: 'Epoxide', smarts: 'C1OC1', severity: 'danger', why: 'Strained electrophile; DNA/protein reactivity.' },
  { id: 'quinone', label: 'Quinone', smarts: 'O=C1C=CC(=O)C=C1', severity: 'danger', why: 'Redox cycling and covalent reactivity.' },
  { id: 'thiol', label: 'Free thiol', smarts: '[SX2H]', severity: 'warn', why: 'Reactive; can form disulfides and metal adducts.' },
  { id: 'alkyl_halide', label: 'Alkyl halide', smarts: '[CX4][Cl,Br,I]', severity: 'warn', why: 'Potential alkylating agent.' },
  { id: 'imid', label: 'Phthalimide–glutarimide (IMiD) scaffold', smarts: 'O=C1CCC(C(=O)N1)N1C(=O)c2ccccc2C1=O', severity: 'danger', why: 'Scaffold linked to cereblon binding and teratogenicity.' },
  { id: 'prim_sulfonamide', label: 'Primary sulfonamide', smarts: 'S(=O)(=O)[NX3;H2]', severity: 'info', why: 'Sulfonamide hypersensitivity is possible in some patients.' },
  // helpers: used only to derive the hERG heuristic, never shown directly
  { id: 'basic_amine', label: 'Basic tertiary amine', smarts: '[NX3;H0;!$(N-C=[O,S,N]);!$(N-a);!$(N-S(=O)=O)]([CX4])([CX4])[CX4]', severity: 'info', why: 'helper', helper: true },
  { id: 'cooh', label: 'Carboxylic acid', smarts: '[CX3](=O)[OX2H1]', severity: 'info', why: 'helper', helper: true },
];

export const HERG_RULE = { logpMin: 3.5 }; // basic amine AND logP > 3.5 AND no carboxylic acid → flag

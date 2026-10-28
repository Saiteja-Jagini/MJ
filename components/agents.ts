import { FlaskConical, ShieldAlert, Crosshair, ScanEye, Gavel } from 'lucide-react';
import type { Role } from '@/lib/types';
export const AGENTS: Record<
  Role,
  {
    name: string;
    discipline: string;
    color: string;
    icon: typeof FlaskConical;
    description: string;
  }
> = {
  chemist: {
    name: 'Atom',
    discipline: 'Chemistry',
    color: '#a5a79b',
    icon: FlaskConical,
    description: 'The structure tells a story.',
  },
  toxicologist: {
    name: 'Venom',
    discipline: 'Toxicology',
    color: '#c99884',
    icon: ShieldAlert,
    description: 'Look for the hidden liabilities.',
  },
  pharmacologist: {
    name: 'Lock',
    discipline: 'Pharmacology',
    color: '#d7c2a7',
    icon: Crosshair,
    description: 'Does the evidence support activity?',
  },
  skeptic: {
    name: 'Doubt',
    discipline: 'Critical review',
    color: '#b78387',
    icon: ScanEye,
    description: 'Challenge the strongest claim.',
  },
  chair: {
    name: 'Gavel',
    discipline: 'Jury chair',
    color: '#e8d2b5',
    icon: Gavel,
    description: 'Weigh every perspective.',
  },
};

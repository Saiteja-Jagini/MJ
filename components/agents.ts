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
    color: '#67d5e8',
    icon: FlaskConical,
    description: 'The structure tells a story.',
  },
  toxicologist: {
    name: 'Venom',
    discipline: 'Toxicology',
    color: '#f3aa77',
    icon: ShieldAlert,
    description: 'Look for the hidden liabilities.',
  },
  pharmacologist: {
    name: 'Lock',
    discipline: 'Pharmacology',
    color: '#82adf5',
    icon: Crosshair,
    description: 'Does the evidence support activity?',
  },
  skeptic: {
    name: 'Doubt',
    discipline: 'Critical review',
    color: '#db9bea',
    icon: ScanEye,
    description: 'Challenge the strongest claim.',
  },
  chair: {
    name: 'Gavel',
    discipline: 'Jury chair',
    color: '#ead59a',
    icon: Gavel,
    description: 'Weigh every perspective.',
  },
};

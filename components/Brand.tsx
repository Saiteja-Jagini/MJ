import { Hexagon } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Hexagon size={29} strokeWidth={1.5} />
        <i />
        <b />
      </span>
      {!compact && (
        <span>
          Molecule<span className="brand-light">Jury</span>
          <sup>LAB</sup>
        </span>
      )}
    </div>
  );
}

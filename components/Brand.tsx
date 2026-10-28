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
          <strong>M</strong>olecule<strong>J</strong>ury
          <sup>LAB</sup>
        </span>
      )}
    </div>
  );
}

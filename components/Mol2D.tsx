'use client';
import { useEffect, useState } from 'react';
import { getRDKit } from '@/lib/rdkit';
import { LoaderCircle, FlaskConical } from 'lucide-react';
export function Mol2D({
  smiles,
  molblock,
  atoms = [],
  className = '',
}: {
  smiles?: string;
  molblock?: string;
  atoms?: number[];
  className?: string;
}) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);
  const selection = atoms.join(',');
  useEffect(() => {
    let active = true;
    getRDKit()
      .then((rd) => {
        let m;
        try {
          m = rd.get_mol(molblock ?? smiles ?? '');
          if (!m) throw new Error('Invalid molecule');
          const result = m.get_svg_with_highlights(
            JSON.stringify({
              width: 600,
              height: 350,
              atoms: selection ? selection.split(',').map(Number) : [],
              highlightColour: [0.65, 0.52, 1],
              bondLineWidth: 1.7,
              backgroundColour: [0, 0, 0, 0],
              legend: '',
            }),
          );
          if (active) {
            setSvg(result);
            setError(false);
          }
        } catch {
          if (active) setError(true);
        } finally {
          m?.delete();
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [smiles, molblock, selection]);
  return (
    <div className={`mol-2d ${className}`} role="img" aria-label="Validated molecular structure">
      {error ? (
        <div className="empty-view">
          <FlaskConical />
          <span>Structure preview unavailable</span>
        </div>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <LoaderCircle className="spin" size={24} />
      )}
    </div>
  );
}

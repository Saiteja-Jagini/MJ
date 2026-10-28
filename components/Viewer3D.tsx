'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, RotateCcw, Expand, LoaderCircle, Eye, Layers3, Info } from 'lucide-react';
import type { Dossier } from '@/lib/types';
import { Mol2D } from './Mol2D';
import { useJury } from '@/lib/store';
export function Viewer3D({ dossier }: { dossier: Dossier }) {
  const root = useRef<HTMLDivElement>(null),
    viewer = useRef<any>(null);
  const [selected, setSelected] = useState(dossier.structure[0]?.componentKey ?? 'c0');
  const [flat, setFlat] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(0);
  const active = useJury((s) => s.activeAnchor);
  const anchor = dossier.anchors.find((a) => a.id === active);
  const key = anchor?.componentKey ?? selected;
  const structure = dossier.structure.find((s) => s.componentKey === key) ?? dossier.structure[0];
  const comp = dossier.subject.components.find((c) => c.key === key);
  useEffect(() => {
    if (flat || !structure?.text || !root.current) return;
    let cancelled = false;
    let v: any;
    let resize: ResizeObserver | undefined;
    const container = root.current;
    import('3dmol')
      .then(($3Dmol) => {
        if (cancelled || !root.current) return;
        try {
          v = $3Dmol.createViewer(container, { backgroundColor: '#231b1d', antialias: true });
          viewer.current = v;
          v.addModel(structure.text, structure.format ?? 'sdf');
          if (structure.mode === 'pdb' || structure.mode === 'alphafold') {
            v.setStyle(
              {},
              {
                cartoon:
                  structure.mode === 'alphafold'
                    ? {
                        colorfunc: (a: any) =>
                          a.b > 90
                            ? '#4361ee'
                            : a.b > 70
                              ? '#65cbf3'
                              : a.b > 50
                                ? '#ffdb13'
                                : '#ff7d45',
                      }
                    : { color: 'spectrum', opacity: 0.9 },
              },
            );
            const ligands = dossier.anchors.filter(
              (a) => a.componentKey === structure.componentKey && a.type === 'ligand',
            );
            for (const a of ligands) {
              v.addStyle({ resn: a.resn }, { stick: { radius: 0.22, colorscheme: 'greenCarbon' } });
              v.addStyle(
                { within: { distance: 5, sel: { resn: a.resn } }, not: { resn: a.resn } },
                { stick: { radius: 0.12 } },
              );
            }
          } else
            v.setStyle(
              {},
              {
                stick: { radius: 0.16, colorscheme: 'Jmol' },
                sphere: { scale: 0.28, colorscheme: 'Jmol' },
              },
            );
          v.zoomTo();
          v.zoom(0.85);
          v.render();
          setError(false);
          setReady((n) => n + 1);
          resize = new ResizeObserver(() => {
            v.resize();
            v.render();
          });
          resize.observe(container);
        } catch {
          setError(true);
          setReady((n) => n + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setReady((n) => n + 1);
        }
      });
    return () => {
      cancelled = true;
      resize?.disconnect();
      if (v) {
        v.removeAllModels();
        v.clear();
      }
      container.replaceChildren();
      viewer.current = null;
    };
  }, [structure, dossier.anchors, flat]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready || flat || !anchor) return;
    v.removeAllLabels();
    v.removeAllShapes();
    if (structure.mode === 'pdb' || structure.mode === 'alphafold') {
      v.setStyle(
        {},
        {
          cartoon:
            structure.mode === 'alphafold'
              ? {
                  colorfunc: (a: any) =>
                    a.b > 90 ? '#4361ee' : a.b > 70 ? '#65cbf3' : a.b > 50 ? '#ffdb13' : '#ff7d45',
                }
              : { color: 'spectrum', opacity: 0.9 },
        },
      );
      for (const a of dossier.anchors.filter(
        (a) => a.componentKey === structure.componentKey && a.type === 'ligand',
      ))
        v.addStyle({ resn: a.resn }, { stick: { radius: 0.22, colorscheme: 'greenCarbon' } });
    }
    let sel: any = {};
    if (anchor.type === 'atoms' && anchor.atoms?.length) {
      // RDKit indices refer to the exact SDF displayed; 3Dmol atom.index is zero-based.
      sel = { index: anchor.atoms };
      const atoms = v.selectedAtoms(sel);
      for (const a of atoms)
        v.addSphere({
          center: { x: a.x, y: a.y, z: a.z },
          radius: 0.6,
          color: '#fb7185',
          opacity: 0.38,
        });
      if (atoms[0])
        v.addLabel(anchor.label.length > 35 ? anchor.label.slice(0, 32) + '…' : anchor.label, {
          position: atoms[0],
          backgroundColor: '#402833',
          backgroundOpacity: 0.9,
          fontColor: '#ffc7d2',
          fontSize: 10,
          borderThickness: 0,
        });
    } else if (anchor.type === 'residues') {
      sel = { or: anchor.residues?.map((r) => ({ chain: r.chain, resi: r.resi })) };
      v.addStyle(sel, { stick: { colorscheme: 'orangeCarbon' } });
    } else if (anchor.type === 'ligand') sel = { resn: anchor.resn };
    v.zoomTo(sel, 650);
    v.zoom(0.75, 650);
    v.render();
  }, [anchor, ready, flat, structure, dossier.anchors]);
  const choose = (k: string) => {
    setSelected(k);
    useJury.getState().focus(`${k}:overview`);
  };
  if (dossier.subject.kind === 'general_research')
    return (
      <section className="viewer-panel no-component-panel" aria-label="Molecular structure status">
        <div className="panel-heading"><span><Box size={16} /> Molecular structure</span></div>
        <p>No verified molecule or protein was identified in this question. A chemical or protein structure cannot be shown accurately for this case.</p>
      </section>
    );
  return (
    <section className="viewer-panel">
      <div className="panel-heading">
        <span>
          <Box size={16} /> Structure explorer
        </span>
        <div className="segmented">
          <button className={!flat ? 'selected' : ''} onClick={() => setFlat(false)}>
            3D
          </button>
          <button className={flat ? 'selected' : ''} onClick={() => setFlat(true)}>
            2D
          </button>
        </div>
      </div>
      {dossier.subject.components.length > 1 && (
        <div className="component-switch">
          {dossier.subject.components.map((c) => (
            <button
              key={c.key}
              className={key === c.key ? 'selected' : ''}
              onClick={() => choose(c.key)}
            >
              {c.gene ?? c.name}
            </button>
          ))}
        </div>
      )}
      <div className="viewer-canvas-wrap">
        {flat || error || !structure?.text ? (
          <>
            {comp?.smiles ? (
              <Mol2D
                smiles={comp.smiles}
                molblock={structure?.format === 'sdf' ? structure.text : comp.molblock}
                atoms={anchor?.type === 'atoms' ? anchor.atoms : []}
              />
            ) : (
              <div className="empty-view">
                <Layers3 size={40} />
                <strong>
                  {flat ? 'Protein sequence & annotations' : 'No verified structure available'}
                </strong>
                <span>
                  {flat
                    ? 'Explore the evidence ledger for protein annotations.'
                    : 'The jury can still evaluate the available evidence.'}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="viewer-canvas" ref={root} />
        )}
        {!ready && !flat && structure?.text && !error && (
          <div className="viewer-loading">
            <LoaderCircle className="spin" />
            <span>Preparing structure</span>
          </div>
        )}
        <div className="viewer-tag">
          <span className="status-dot" />
          {structure?.mode === 'flat'
            ? '2D coordinates'
            : structure?.mode === 'alphafold'
              ? 'PREDICTED STRUCTURE'
              : structure?.mode === 'conformer'
                ? 'COMPUTED CONFORMER'
                : 'STRUCTURE VIEW'}
        </div>
        <div className="viewer-tools">
          <button
            aria-label="Reset camera"
            onClick={() => {
              viewer.current?.zoomTo();
              viewer.current?.render();
            }}
          >
            <RotateCcw size={16} />
          </button>
          <button
            aria-label="Expand structure"
            onClick={() => root.current?.parentElement?.requestFullscreen?.().catch(() => {})}
          >
            <Expand size={16} />
          </button>
        </div>
        <div className="viewer-grid-label">
          X <span>Y</span> Z
        </div>
      </div>
      <div className="viewer-caption">
        <Info size={13} />
        <span>{structure?.provenance}</span>
      </div>
      {anchor && (
        <div className="anchor-caption">
          <Eye size={14} />
          <span>
            Focused on <strong>{anchor.label}</strong>
          </span>
        </div>
      )}
      {dossier.subject.kind === 'complex' && (
        <p className="docking-note">Your molecule is not docked into this protein.</p>
      )}
    </section>
  );
}

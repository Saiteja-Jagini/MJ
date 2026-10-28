'use client';
import { useRef, useState, type ClipboardEvent } from 'react';
import {
  ArrowRight,
  Upload,
  ImagePlus,
  FlaskConical,
  Dna,
  Link2,
  X,
  LoaderCircle,
  FileText,
  Command,
  MessageSquareText,
} from 'lucide-react';
import { Button } from './ui/button';
import { useJury } from '@/lib/store';
import { AGENTS } from './agents';
import { AtomArtwork } from './AtomArtwork';
import { toast } from 'sonner';
export function DropZone({ onImage }: { onImage: (url: string | null) => void }) {
  const [text, setText] = useState(''),
    [target, setTarget] = useState(''),
    [mode, setMode] = useState('molecule'),
    [file, setFile] = useState<File | null>(null),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = useJury((s) => s.busy);
  const resolve = useJury((s) => s.resolve);
  const error = useJury((s) => s.error);
  const accept = (f: File) => {
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Please choose a file smaller than 5 MB.');
      return;
    }
    if (!/\.(sdf|mol|pdb|cif|fasta|fa|faa|png|jpe?g)$/i.test(f.name)) {
      toast.error('Use SDF, MOL, PDB, CIF, FASTA, PNG or JPG.');
      return;
    }
    setFile(f);
    onImage(/^image\//.test(f.type) ? URL.createObjectURL(f) : null);
  };
  const paste = (e: ClipboardEvent) => {
    const f = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
    if (f) {
      e.preventDefault();
      accept(f);
    }
  };
  const submit = async () => {
    const body: Record<string, unknown> = {
      text: mode === 'molecule' && text === 'Catechol-rhodanine' ? 'CASE-12' : text,
    };
    if (mode === 'pair' && target.trim()) body.targetText = target;
    if (mode === 'protein') body.preferredKind = 'protein';
    if (file) {
      if (file.type.startsWith('image/')) {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        body.imageBase64 = base64;
        body.mime = file.type;
      } else body.file = { name: file.name, text: await file.text() };
    }
    await resolve(body);
  };
  return (
    <div className="intake-view">
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-spark">✦</span> FIVE MINDS. A CLEARER PICTURE.
          </div>
          <h1>
            Every molecule
            <br />
            deserves a <span>fair hearing.</span>
          </h1>
          <p>
            Bring your molecule. Let the evidence speak.
            <br />
            Five AI specialists examine, challenge, and explain what comes next.
          </p>
        </div>
        <div className="hero-visual">
          <AtomArtwork />
          <span className="art-label">
            <span /> STRUCTURE → EVIDENCE → INSIGHT
          </span>
        </div>
      </div>
      <div className="intake-grid">
        <div className="input-column">
          <section
            className={`input-panel ${drag ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) accept(f);
            }}
          >
            <div className="input-panel-head">
              <div className="input-tabs">
                {[
                  { id: 'molecule', label: 'Molecule', icon: FlaskConical },
                  { id: 'protein', label: 'Protein', icon: Dna },
                  { id: 'pair', label: 'Molecule + target', icon: Link2 },
                  { id: 'research', label: 'Research question', icon: MessageSquareText },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setMode(t.id)}
                    className={mode === t.id ? 'selected' : ''}
                  >
                    <t.icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="input-body">
              <label htmlFor="subject-input">
                {mode === 'research'
                  ? 'Describe your hypothesis, data, and decision question'
                  : mode === 'protein'
                    ? 'What target are we investigating?'
                    : 'What are we investigating?'}
              </label>
              <textarea
                id="subject-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={paste}
                placeholder={
                  mode === 'research'
                    ? 'Example: We found an EGFR inhibitor with 0.4 µM activity in one assay. Is it worth advancing, and what would limit that conclusion?'
                    : mode === 'protein'
                      ? 'Enter a protein name, UniProt ID, or FASTA sequence…'
                      : 'Enter a molecule name, SMILES, or composition…'
                }
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && (text.trim() || file))
                    void submit();
                }}
                spellCheck={false}
              />
              {mode === 'pair' && (
                <input
                  className="target-input"
                  aria-label="Target protein"
                  placeholder="Target protein, e.g. ABL1"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              )}
              {file && (
                <div className="file-chip">
                  <FileText size={15} />
                  <span>{file.name}</span>
                  <small>{(file.size / 1024).toFixed(0)} KB</small>
                  <button
                    aria-label="Remove uploaded file"
                    onClick={() => {
                      setFile(null);
                      onImage(null);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="input-hint">
                <span>Names, SMILES, structures, sequences, images, or a research question</span>
                <span>
                  <Command size={11} /> ↵
                </span>
              </div>
            </div>
            <div className="input-footer">
              <input
                ref={input}
                type="file"
                hidden
                accept=".sdf,.mol,.pdb,.cif,.fasta,.fa,.faa,.png,.jpg,.jpeg"
                onChange={(e) => {
                  if (e.target.files?.[0]) accept(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <button className="upload-button" onClick={() => input.current?.click()}>
                <Upload size={16} />
                <span>Upload a file</span>
                <small>or drop it here</small>
              </button>
              <Button
                disabled={busy || (!text.trim() && !file) || (mode === 'pair' && !target.trim())}
                onClick={() => void submit()}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" />
                    Identifying…
                  </>
                ) : (
                  <>
                    Analyze input
                    <ArrowRight size={17} />
                  </>
                )}
              </Button>
            </div>
            {drag && (
              <div className="drop-overlay">
                <ImagePlus size={30} />
                <strong>Drop your scientific starting point</strong>
                <span>Up to 5 MB</span>
              </div>
            )}
          </section>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <p className="confirmation-note">
            <span className="small-check">✓</span> You’ll confirm the identity before the jury
            begins.
          </p>
        </div>
        <aside className="jury-ready">
          <div className="jury-ready-title">
            <span className="eyebrow">MEET YOUR JURY</span>
            <span className="pill-neutral">5 specialists</span>
          </div>
          <h2>
            Different perspectives.
            <br />
            Better questions.
          </h2>
          <div className="ready-agents">
            {Object.entries(AGENTS).map(([role, a]) => (
              <div className="ready-agent" key={role}>
                <span
                  className="agent-avatar"
                  style={{ '--agent-color': a.color } as React.CSSProperties}
                >
                  <a.icon size={19} />
                </span>
                <div>
                  <strong>
                    {a.name}
                    <span>{a.discipline}</span>
                  </strong>
                  <p>{a.description}</p>
                </div>
                <span className="agent-ready-dot" />
              </div>
            ))}
          </div>
          <div className="ready-foot">
            <span className="status-dot" /> Independent lenses. Shared evidence.
          </div>
        </aside>
      </div>
    </div>
  );
}

'use client';
import { useRef, useState, type ClipboardEvent } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Upload,
  ImagePlus,
  FlaskConical,
  Dna,
  Link2,
  X,
  LoaderCircle,
  FileText,
  Sparkles,
  Command,
} from 'lucide-react';
import { Button } from './ui/button';
import { useJury } from '@/lib/store';
import { AGENTS } from './agents';
import { AtomArtwork } from './AtomArtwork';
import { toast } from 'sonner';
const examples = [
  { name: 'Terfenadine', label: 'A safety case study', icon: FlaskConical, type: 'molecule' },
  { name: 'Fexofenadine', label: 'A molecular comparison', icon: FlaskConical, type: 'molecule' },
  { name: 'EGFR', label: 'Explore a drug target', icon: Dna, type: 'protein' },
  {
    name: 'Catechol-rhodanine',
    label: 'An illustrative screen hit',
    icon: Sparkles,
    type: 'molecule',
  },
];
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
              <span className="small-label">NEW ANALYSIS</span>
            </div>
            <div className="input-body">
              <label htmlFor="subject-input">
                {mode === 'protein'
                  ? 'What target are we investigating?'
                  : 'What are we investigating?'}
              </label>
              <textarea
                id="subject-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={paste}
                placeholder={
                  mode === 'protein'
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
                <span>Names, SMILES, structures, sequences, or images</span>
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
          <div className="examples-head">
            <span>NEED A STARTING POINT?</span>
            <span>
              Try an example <ArrowUpRight size={13} />
            </span>
          </div>
          <div className="examples-grid">
            {examples.map((ex) => (
              <button
                key={ex.name}
                className="example-card"
                disabled={busy}
                onClick={() => {
                  setMode(ex.type);
                  setText(ex.name);
                  setFile(null);
                  onImage(null);
                }}
              >
                <div className={`example-icon ${ex.type}`}>
                  <ex.icon size={19} />
                </div>
                <div>
                  <strong>{ex.name}</strong>
                  <span>{ex.label}</span>
                </div>
                <ArrowUpRight size={15} className="example-arrow" />
              </button>
            ))}
          </div>
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
      <div className="flow-strip">
        {[
          { n: '01', title: 'Identify', desc: 'Confirm what you submitted' },
          { n: '02', title: 'Investigate', desc: 'Gather the scientific evidence' },
          { n: '03', title: 'Deliberate', desc: 'Watch the specialists debate' },
          { n: '04', title: 'Understand', desc: 'Explore the verdict in 3D' },
        ].map((s) => (
          <div key={s.n}>
            <span>{s.n}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.desc}</p>
            </div>
            <ArrowRight size={15} />
          </div>
        ))}
      </div>
      <footer className="intake-footer">
        <span>Built on public science. Designed for better research decisions.</span>
        <span>Hypothesis triage · Not clinical advice</span>
      </footer>
    </div>
  );
}

'use client';
import { useRef, useState, type ClipboardEvent } from 'react';
import { ArrowRight, FileText, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { useJury } from '@/lib/store';
import { Button } from './ui/button';

export interface HistoryReference {
  id: string;
  title: string;
  createdAt: string;
}

export function AnalysisInput({
  value,
  onChange,
  file,
  onFileChange,
  references,
  onRemoveReference,
}: {
  value: string;
  onChange: (value: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  references: HistoryReference[];
  onRemoveReference: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const busy = useJury((s) => s.busy);
  const error = useJury((s) => s.error);
  const resolve = useJury((s) => s.resolve);
  const accept = (next: File) => {
    if (next.size > 5 * 1024 * 1024) return toast.error('Choose a file smaller than 5 MB.');
    if (!/\.(sdf|mol|pdb|cif|fasta|fa|faa|png|jpe?g)$/i.test(next.name))
      return toast.error('Use SDF, MOL, PDB, CIF, FASTA, PNG or JPG.');
    onFileChange(next);
  };
  const paste = (event: ClipboardEvent) => {
    const image = [...event.clipboardData.items]
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();
    if (image) {
      event.preventDefault();
      accept(image);
    }
  };
  const submit = async () => {
    if (busy || (!value.trim() && !file)) return;
    const body: Record<string, unknown> = {
      text: value,
      referenceRunIds: references.map((run) => run.id),
    };
    if (file) {
      if (file.type.startsWith('image/')) {
        body.imageBase64 = await new Promise<string>((resolveFile, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolveFile(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        body.mime = file.type;
      } else {
        body.file = { name: file.name, text: await file.text() };
      }
    }
    await resolve(body);
  };
  return (
    <div className="analysis-input-page">
      <p className="analysis-input-line">
        Describe the subject, your use case, and the decision you need.
      </p>
      <section
        className={`analysis-query ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files[0]) accept(event.dataTransfer.files[0]);
        }}
      >
        <label htmlFor="analysis-prompt">Your research question</label>
        <textarea
          id="analysis-prompt"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={paste}
          placeholder="Describe the question, issue, and any observations. Name a molecule or target if your case has one."
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submit();
          }}
        />
        {references.length > 0 && (
          <div className="analysis-references" aria-label="Referenced analyses">
            {references.map((run) => (
              <span key={run.id}>
                Reference: {run.title}
                <button
                  onClick={() => onRemoveReference(run.id)}
                  aria-label={`Remove ${run.title}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {file && (
          <div className="analysis-file">
            <FileText size={16} /> {file.name}
            <button
              aria-label="Remove attachment"
              onClick={() => {
                onFileChange(null);
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="analysis-query-actions">
          <input
            ref={picker}
            type="file"
            hidden
            accept=".sdf,.mol,.pdb,.cif,.fasta,.fa,.faa,.png,.jpg,.jpeg"
            onChange={(event) => {
              if (event.target.files?.[0]) accept(event.target.files[0]);
              event.target.value = '';
            }}
          />
          <button
            className="analysis-attach"
            onClick={() => picker.current?.click()}
          >
            <Paperclip size={17} /> Attach file
          </button>
          <Button onClick={() => void submit()} disabled={busy || (!value.trim() && !file)}>
            {busy ? 'Identifying…' : 'Analyze'} <ArrowRight size={17} />
          </Button>
        </div>
      </section>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

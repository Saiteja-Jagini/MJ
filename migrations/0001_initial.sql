CREATE TABLE IF NOT EXISTS resolved_subjects (
 id uuid PRIMARY KEY, session_id uuid NOT NULL, subject jsonb NOT NULL CHECK(jsonb_typeof(subject)='object'),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS analysis_runs (
 id uuid PRIMARY KEY, session_id uuid NOT NULL, title text NOT NULL CHECK(length(title)>0),
 kind text NOT NULL CHECK(kind IN ('small_molecule','protein','complex','mixture')),
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','running','done','error')),
 schema_version integer NOT NULL DEFAULT 2 CHECK(schema_version=2),
 subject jsonb NOT NULL CHECK(jsonb_typeof(subject)='object'),
 dossier jsonb NOT NULL CHECK(jsonb_typeof(dossier)='object'),
 verdict jsonb CHECK(verdict IS NULL OR (jsonb_typeof(verdict)='object' AND
   (verdict->'percent'->>'go')::numeric BETWEEN 0 AND 100 AND
   (verdict->'percent'->>'caution')::numeric BETWEEN 0 AND 100 AND
   (verdict->'percent'->>'nogo')::numeric BETWEEN 0 AND 100 AND
   (verdict->'percent'->>'go')::numeric+(verdict->'percent'->>'caution')::numeric+(verdict->'percent'->>'nogo')::numeric=100)),
 coverage integer NOT NULL CHECK(coverage BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_session_created_idx ON analysis_runs(session_id,created_at DESC);
CREATE TABLE IF NOT EXISTS evidence_items (
 run_id uuid NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
 evidence_id text NOT NULL CHECK(evidence_id ~ '^E[0-9]+$'),source text NOT NULL,component_key text NOT NULL,
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),PRIMARY KEY(run_id,evidence_id)
);
CREATE TABLE IF NOT EXISTS debate_turns (
 run_id uuid NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,sequence integer NOT NULL CHECK(sequence>=0),
 role text NOT NULL CHECK(role IN ('chemist','toxicologist','pharmacologist','skeptic','chair')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND
   (data->>'go')::numeric BETWEEN 0 AND 100 AND (data->>'caution')::numeric BETWEEN 0 AND 100 AND (data->>'nogo')::numeric BETWEEN 0 AND 100 AND
   (data->>'go')::numeric+(data->>'caution')::numeric+(data->>'nogo')::numeric=100),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(run_id,sequence)
);

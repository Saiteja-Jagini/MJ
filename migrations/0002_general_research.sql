ALTER TABLE analysis_runs
  DROP CONSTRAINT IF EXISTS analysis_runs_kind_check;
ALTER TABLE analysis_runs
  ADD CONSTRAINT analysis_runs_kind_check
  CHECK (kind IN ('small_molecule', 'protein', 'complex', 'mixture', 'general_research'));

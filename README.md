# MoleculeJury

**Every molecule deserves a fair hearing.**

A working implementation of the supplied v2 specification: free input → identity confirmation → evidence dossier → five-specialist discussion → deterministic verdict → clickable structural explanation. The supplied v1 SMARTS alerts, chemistry analyzer, RDKit loader, and twelve reference cases are preserved in the repository. OpenAI replaces Gemini as requested; PostgreSQL runs in Docker.

## Run locally

Requirements: Node.js 20.9 or later and Docker Desktop using Linux containers. This workspace was validated with Node 24 and PostgreSQL 17.

```bash
npm install
# Create .env.local using .env.example; fill in your OpenAI key and local DB password.
npm run db:up
npm run db:migrate
npm run dev
```

Open **http://localhost:3000**. On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

The configured container is `moleculejury-postgres`, listening only on `127.0.0.1:15432`. Its data lives in the Docker volume `molecule_jury_moleculejury-data`. `docker compose --env-file .env.local stop` stops it without deleting data. Do not use `down -v` unless you intentionally want to erase the database.

The current workspace already contains the required `.env.local` configuration and generated model artifacts. Secrets are ignored by Git. Add the actual API key directly to that file; never put it in a `NEXT_PUBLIC_` variable.

```dotenv
OPENAI_API_KEY=your_key
MODEL_FAST=gpt-4.1-mini
MODEL_SMART=gpt-4.1
POSTGRES_USER=moleculejury
POSTGRES_PASSWORD=your_local_password
POSTGRES_DB=moleculejury
POSTGRES_PORT=15432
DATABASE_URL=postgresql://moleculejury:your_local_password@localhost:15432/moleculejury
```

`MODEL_FAST` handles specialists and image interpretation; `MODEL_SMART` handles the chair. Models must support structured outputs, and the fast model must support image inputs. Six model calls are used for a normal discussion; image interpretation is one additional call. OpenAI API usage is billed to the configured project.

## What is implemented

- Compound names, SMILES, InChI/CAS resolution, protein names/accessions, PDB IDs, FASTA, SDF/MOL, PDB/CIF, PNG/JPEG, compositions, and molecule–target pairs.
- Explicit identity confirmation and ambiguity selection before the jury starts. Images show the original beside a verified molecular rendering.
- RDKit descriptors, original v1 SMARTS alerts, hERG structural heuristic, four trained toxicity models, applicability flags, and the three nearest known compounds.
- Live PubChem, ChEMBL, UniProt, RCSB, AlphaFold, Open Targets, openFDA, and Europe PMC retrieval. Failed lookups are visible and reduce applicable coverage.
- Atom, Venom, and Lock run in parallel. Doubt cross-examines; the targeted specialist rebuts; Gavel issues reasons, risks, and next steps. Interrupted runs resume from saved successful turns.
- Integer GO/CAUTION/NO-GO percentages sum to exactly 100 using largest-remainder rounding. Rebuttals replace earlier votes; confidence is normalized before weighting.
- 3Dmol molecular/protein views, 2D fallback, computed/experimental/predicted provenance labels, atom/residue focus, pLDDT colouring for AlphaFold, and explicit no-docking labels for pairs.
- Desktop Chamber and mobile Debate / 3D / Verdict tabs; keyboard-accessible dialogs; reduced-motion support; verdict-dependent accent colours.
- PostgreSQL-backed analysis history, source ledger, validated dossier snapshots, ordered debate turns, and verdict persistence scoped to an anonymous browser session.

No v1 prediction game, leaderboard, voice, analog generation, or mechanism illustrations are added. Those are not part of the v2 core.

## Architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, accessible Radix/shadcn-style primitives, Motion, Lucide, Zustand, AI SDK 5 / OpenAI, RDKit WASM, 3Dmol, Drizzle ORM, and PostgreSQL 17.

```text
app/api/resolve       Validate input and store resolved identity candidates
app/api/dossier       Load the stored identity, gather evidence, persist a validated dossier
app/api/jury          Read that dossier, stream NDJSON discussion, persist each successful turn
app/api/runs          Session-scoped history and restoration
app/api/health        Database, model-artifact, and AI-configuration readiness
lib/chem              Original v1 chemistry and server verification helpers
lib/brain*            Model/precedent loading, fingerprint parity, and inference
lib/sources.ts        Public database adapters with bounded timeouts
lib/evidence.ts       Numbered evidence, source provenance, coverage, drivers, and anchors
lib/scoring.ts        Vote validation, citation filtering, and deterministic aggregation
lib/db                Typed PostgreSQL schema and transactional persistence
components            Intake, confirmation, Chamber, viewers, verdict, and ledger
```

The browser executes RDKit and the local model path. The server independently verifies chemistry and builds the authoritative dossier before saving it. The jury accepts only a run ID, not client-authored evidence. This additional server validation supports the requested data-integrity requirement.

## Data integrity

- Shared Zod contracts validate API boundaries, stored dossier reads, model outputs, IDs, finite numbers, and evidence/anchor relationships.
- Resolved identities are stored server-side before confirmation; changing a client-side name, CID, or SMILES cannot alter the server's confirmed subject.
- SQL constraints enforce vote totals, bounded coverage, allowed run kinds/statuses, and unique turn/evidence keys. Foreign keys tie evidence and turns to an analysis.
- Dossier and evidence insertion is transactional. Failed seats do not fabricate turns; successful seats remain saved for retry.
- Scientific data is never replaced with mock facts. Missing sources and unavailable models are labelled.
- SMARTS atom indices come from the exact displayed structure. Hydrogen normalization is used only for conformer identity comparison; specified stereochemistry is checked. Protein residue anchors require a verified sequence mapping.
- Target-specific activity is not inferred from unrelated ChEMBL assays when a requested target cannot be resolved.
- Uploaded protein coordinates and full sequences are not included in AI prompts. Citation IDs are checked against the specialist's supplied evidence.
- A browser-session cookie scopes history; this is a local research workspace, not a multi-user authentication system.

Validation prevents malformed data from being accepted; it cannot guarantee the truth of public database records or every generated scientific interpretation.

## Model artifacts and reproducibility

`public/brain/` contains real trained artifacts, not placeholders. `manifest.json` records dataset sizes, split method, fingerprint settings, generation time, and SHA-256 hashes.

| Endpoint | Dataset compounds | Held-out AUC |
| -------- | ----------------: | -----------: |
| hERG     |               645 |       0.8037 |
| Ames     |             7,255 |       0.8770 |
| DILI     |               475 |       0.8883 |
| ClinTox  |             1,440 |       0.8497 |

Models are logistic regressions on radius-2, 2,048-bit Morgan fingerprints. Canonical duplicate structures are removed; conflicting duplicate labels are excluded. Splits are stratified random 80/20 with seed 7. This is **not scaffold-split or prospective validation**. Applicability is reported using nearest training-compound similarity ≥ 0.3. The precedent library contains **2,810** entries; ClinTox holdout compounds are excluded from it.

To regenerate with Python 3.11:

```bash
python -m venv .venv
# Windows executable shown; use .venv/bin/python on macOS/Linux.
.venv/Scripts/python -m pip install -r scripts/requirements-brain.txt
.venv/Scripts/python -m pip install PyTDC==1.1.15 --no-deps
.venv/Scripts/python scripts/train_brain.py
npm run brain:parity
```

The PyTDC version used here supplies the ClinTox toxicity label as `Y`; the document's explicit `CT_TOX` column parameter is not accepted by that version. The Python-to-JavaScript aspirin fingerprint parity test passes bit-for-bit.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run brain:parity
npm run db:check
node --env-file=.env.local scripts/check-integrity.mjs
npm run eval
npm run build
# Optional live evaluation: calls OpenAI and public databases; incurs API usage.
node scripts/eval-live.mjs
```

Recorded results are in `data/evaluation/`:

- **25 automated tests passed:** reference chemistry, invalid input, vote rounding, confidence weighting, rebuttal replacement, citation isolation, prompt boundaries, and interrupted-jury recovery.
- **Offline rules/models/precedents:** 6/12 reference verdicts matched (50%). This excludes live retrieval and LLMs.
- **Full live dossier and OpenAI jury:** all 12 completed, with 8/12 matching the supplied reference labels (66.7%). The model is not forced to match them. Gefitinib, rosiglitazone, thalidomide, and catechol-rhodanine differed in this recorded run.
- **ClinTox:** 95.5% binary accuracy on the first 200 held-out compounds, with TP 8 / TN 183 / FP 4 / FN 5. This imbalanced binary endpoint is not a jury-verdict accuracy metric. Full held-out AUC is 0.8497.
- Browser checks exercised desktop and mobile layouts, actual OpenAI debate, saved-run restoration, molecule/protein 3D views, and invalid-input messaging.
- Live intake checks passed for EGFR, PDB 1IEP, a composition, MOL, PDB, CIF, FASTA, and an aspirin PNG. Invalid text, malformed SMILES, and fake image contents were rejected.
- Database checks rejected invalid vote totals, cross-session access, and a forged unresolved subject ID.

The recorded demonstration returned terfenadine **NO-GO 76%** and fexofenadine **GO 61%**. Live model responses and public records can change; these are observations, not guaranteed outputs.

## Scientific boundaries

Percentages are jury confidence, not calibrated clinical probabilities. Evidence grades describe coverage. Structure alerts and simple toxicity models are hypotheses, not diagnoses. FAERS reports do not prove causation. Similarity does not establish identical safety or efficacy. Image recognition is fallible. Famous compounds may be recognized by the LLM beyond the provided evidence. Molecule–protein displays are not docked complexes.

The original specifications are archived in `docs/`. Their suggested type-check bypass was deliberately not used: production builds must pass TypeScript. Deployment is not configured; the delivered app runs locally with Docker PostgreSQL.

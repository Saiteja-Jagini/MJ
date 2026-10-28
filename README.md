# MoleculeJury

**Every molecule deserves a fair hearing.**

A working implementation of the supplied v2 specification: free input → identity confirmation → evidence dossier → five-specialist discussion → Decisions API verdict → clickable structural explanation. The supplied v1 SMARTS alerts, chemistry analyzer, RDKit loader, and twelve reference cases are preserved in the repository. OpenAI replaces Gemini as requested; PostgreSQL runs in Docker.

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

Generated model artifacts are committed. Create `.env.local` from `.env.example` and add your actual API key there; never put it in a `NEXT_PUBLIC_` variable. Secrets are ignored by Git.

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

`MODEL_FAST` handles specialists and image interpretation; `MODEL_SMART` handles the chair. Models must support structured outputs, and the fast model must support image inputs. The final decision uses **POST https://api.openai.com/v1/decisions** with **gpt-6-luna**, using the same `OPENAI_API_KEY`. Six generation calls plus one Decisions request are used for a normal discussion; image interpretation is one additional call. OpenAI API usage is billed to the configured project.

## Deploy on Vercel

The local Docker database at `localhost:15432` is reachable only from your computer. A Vercel deployment needs a hosted PostgreSQL database; the app's history, dossier, and jury routes cannot work without it. The page may build and load even while `/api/health` reports `database: false`.

1. In the Vercel project, add a hosted Postgres integration (for example Neon) under Storage and connect it to the **Production** environment. A database provider may require a plan selection. Do not copy the local `.env.local` database URL to Vercel.
2. Confirm the integration supplies `DATABASE_URL` or `POSTGRES_URL` to the Production environment. The app accepts either. The URL must point to the hosted database, not `localhost` or `127.0.0.1`. Keep `OPENAI_API_KEY` in Production too.
3. Apply the schema once to that database. With the Vercel CLI installed, signed in, and linked to this project, run `vercel env run -- npm run db:migrate:remote`. This executes the two checked-in migrations against the project's configured database. `vercel env run -- npm run db:check:remote` verifies the tables afterward.
4. Redeploy the production branch after changing environment variables. Existing deployments do not inherit newly added variables.
5. Open `/api/health` on the deployed site. Expect `database: true`, `databaseStatus: "ready"`, `ai: true`, and `brain: true`. Then open History; `/api/runs` should respond successfully.

`databaseStatus` explains the common failure: `not_configured` means no URL, `local_only` means a localhost URL was supplied to Vercel, `unreachable` means the hosted connection failed, and `schema_missing` means the database is reachable but the migrations have not been applied. It reports no credentials. The npm `cache-dir` warning and Next.js telemetry notice are informational and do not indicate a failed build.

## What is implemented

- Compound names, SMILES, InChI/CAS resolution, protein names/accessions, PDB IDs, FASTA, SDF/MOL, PDB/CIF, PNG/JPEG, compositions, molecule–target pairs, and prose research questions.
- Free-form questions and supported attachments proceed directly to the jury. Verified molecular identities receive a chemical or protein structure; unverified cases never receive an invented structure.
- RDKit descriptors, original v1 SMARTS alerts, hERG structural heuristic, four trained toxicity models, applicability flags, and the three nearest known compounds.
- Live PubChem, ChEMBL, UniProt, RCSB, AlphaFold, Open Targets, openFDA, and Europe PMC retrieval. Failed lookups are visible and reduce applicable coverage.
- Atom, Venom, and Lock run in parallel. Doubt cross-examines; the targeted specialist rebuts; OpenAI Decisions evaluates the dossier and debate; Gavel explains its selected outcome with reasons, risks, and next steps. Interrupted runs resume from saved successful turns.
- Final GO/CAUTION/NO-GO percentages are the Decisions API choice probabilities, rounded to exactly 100. Confidence is the separate API confidence field. Weighted votes remain provisional during debate and for legacy saved runs.
- Prose questions are parsed by the configured fast model and resolved against the identity pipeline. The full typed context reaches the jury and Decisions as unverified user input. The final view presents a brief review, verified structure, and Decision API assessment in three cards, followed by suggestions and citations.
- 3Dmol molecular/protein views, 2D fallback, computed/experimental/predicted provenance labels, atom/residue focus, pLDDT colouring for AlphaFold, and explicit no-docking labels for pairs.
- A responsive chamber presents the five agent dialogues during deliberation. The final cards adapt to desktop and mobile layouts; reduced-motion support and verdict-dependent accent colours remain available.
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
lib/ai/decisions.ts   Required Decisions API request, response validation, and provenance
lib/scoring.ts        Provisional vote aggregation and final Decisions distribution formatting
lib/db                Typed PostgreSQL schema and transactional persistence
components            Intake, confirmation, Chamber, viewers, verdict, and ledger
```

The browser executes RDKit and the local model path. The server independently verifies chemistry and builds the authoritative dossier before saving it. The jury accepts only a run ID, not client-authored evidence. This additional server validation supports the requested data-integrity requirement.

## Decisions API

The final result is produced by [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions) with `gpt-6-luna`. The server supplies the evidence dossier and debate, asks a `choice` question with GO / CAUTION / NO_GO options, validates all returned probabilities, and saves the original distribution, confidence, model, request ID, and timestamp with the chair turn and verdict in PostgreSQL JSONB. No schema migration is required. The chair explains the API result; its generated votes cannot override it.

A refusal, invalid distribution, or API failure leaves the run retryable without a final verdict. A successful chair turn retains the decision for recovery. Completed historical runs stay unchanged and are labelled as legacy weighted assessments. A new analysis is required to obtain a Decisions result for an old completed case.

No additional key is needed. The existing OpenAI project must have access to Decisions and `gpt-6-luna`. Verify connectivity with `npx tsx --env-file=.env.local scripts/check-decisions.ts` (a billable request). Generation models remain independently configured by MODEL_FAST and MODEL_SMART.

The live integration check (`node scripts/check-decisions-flow.mjs`) completed all six turns for fexofenadine, returned GO 70% / CAUTION 30% / NO-GO 0% with separate API confidence 55%, and verified identical PostgreSQL restoration. Its request provenance is recorded in `data/evaluation/decisions-smoke.json`. This is one integration check, not an accuracy evaluation. Future full evaluations write `live-decisions.json`, preserving the legacy results.

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

Recorded results are in `data/evaluation/`. The reference-case metrics below predate the Decisions migration and evaluate the legacy weighted implementation, not the new Decisions verdicts:

- **32 automated tests passed:** reference chemistry, invalid input, vote rounding, confidence weighting, rebuttal replacement, citation isolation, prompt boundaries, and interrupted-jury recovery.
- **Offline rules/models/precedents:** 6/12 reference verdicts matched (50%). This excludes live retrieval and LLMs.
- **Full live dossier and OpenAI jury:** all 12 completed, with 8/12 matching the supplied reference labels (66.7%). The model is not forced to match them. Gefitinib, rosiglitazone, thalidomide, and catechol-rhodanine differed in this recorded run.
- **ClinTox:** 95.5% binary accuracy on the first 200 held-out compounds, with TP 8 / TN 183 / FP 4 / FN 5. This imbalanced binary endpoint is not a jury-verdict accuracy metric. Full held-out AUC is 0.8497.
- Browser checks exercised desktop and mobile layouts, actual OpenAI debate, saved-run restoration, molecule/protein 3D views, and invalid-input messaging.
- Live intake checks passed for EGFR, PDB 1IEP, a composition, MOL, PDB, CIF, FASTA, and an aspirin PNG. Invalid text, malformed SMILES, and fake image contents were rejected.
- Database checks rejected invalid vote totals, cross-session access, and a forged unresolved subject ID.

The recorded demonstration returned terfenadine **NO-GO 76%** and fexofenadine **GO 61%**. Live model responses and public records can change; these are observations, not guaranteed outputs.

## Scientific boundaries

Final percentages are Decisions choice probabilities, not calibrated clinical outcome probabilities. Evidence grades describe coverage. Structure alerts and simple toxicity models are hypotheses, not diagnoses. FAERS reports do not prove causation. Similarity does not establish identical safety or efficacy. Image recognition is fallible. Famous compounds may be recognized by the LLM beyond the provided evidence. Molecule–protein displays are not docked complexes.

The original specifications are archived in `docs/`. Their suggested type-check bypass was deliberately not used: production builds must pass TypeScript. Deployment is not configured; the delivered app runs locally with Docker PostgreSQL.

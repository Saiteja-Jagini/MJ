# MoleculeJury: Execution Brain (v1.0)

> **One-liner:** *Five AI specialists argue over a drug candidate in a game-style "jury chamber". A hidden human-vs-AI prediction game, a deterministic chemistry engine and live evidence decide the verdict, and the 3D protein, 2D molecule, radar, theme and illustration all rebuild themselves around it.*

**How to use this file:** it is the single source of truth. Build in the order of Section 13. Every code block is meant to be pasted as-is. Where a section gives a *spec* instead of code (pure UI composition), implement it exactly as specified. Do not add features that are not listed here until the Section 14 checklist is green.

---

## Table of contents
1. Product spec
2. Honest framing (what is real vs simulated)
3. Pre-flight (do in the 30 min before the clock starts)
4. Stack, pinned deps, env
5. Repo tree
6. Data: seeds, ambiguity matrix, cache builder
7. Chemistry engine (RDKit.js, alerts, scores)
8. Evidence layer
9. AI layer: schemas, prompts, API routes
10. Client state and stream consumer
11. UI/UX: design system, layout, components, game loop
12. Voice, illustration, analog forge
13. 4-hour timeline with acceptance tests
14. QA checklist, risks, cut list
15. Demo script
16. Stretch: shareable replays (DB), compare mode, Realtime voice
17. Master prompt for a coding agent

---

## 1. Product spec

### 1.1 Concept
A **prediction game + AI review panel** for early drug-candidate triage.

- The player opens a **case file** (a molecule + target). In **Blind Mode** the name and regulatory outcome are hidden.
- The player **locks in a prediction**: `GO`, `CAUTION` or `NO_GO`.
- Five AI "seats" debate, each seeing only the evidence for its specialty, which creates genuine disagreement.
- The **Chair** issues a structured verdict. The UI reacts: theme colour, 3D camera, highlighted toxic substructures, radar morph, AI illustration, gavel sound.
- **Reality Reveal:** the real-world outcome is shown. Points for Human, Jury, and "Beat the Jury".
- **Analog Forge:** ask for safer analogs. The LLM proposes SMILES, **RDKit validates them** (invalid ones are rejected on screen), and the jury re-scores the best one. The UI flips.

### 1.2 Verdict semantics (use these exact definitions in prompts and UI)
| Verdict | Meaning |
|---|---|
| `GO` | Advance to the next development stage. Real activity evidence and no unmitigated severe liability. |
| `CAUTION` | Advance only after specific de-risking experiments. Serious positive **and** negative evidence coexist. |
| `NO_GO` | Deprioritize. A credible unmitigated liability outweighs the benefit, or evidence is absent and alerts are severe. |

### 1.3 The cast (game characters)
| Role id | Callsign | Lens | Colour | Icon (lucide) |
|---|---|---|---|---|
| `chemist` | **Atom** | drug-likeness, reactivity, PAINS | `#22D3EE` | `FlaskConical` |
| `toxicologist` | **Venom** | toxicophores, hERG/liver, class effects | `#FB923C` | `Skull` |
| `pharmacologist` | **Lock** | target engagement, potency, selectivity | `#60A5FA` | `Crosshair` |
| `skeptic` | **Doubt** | red team: attacks the strongest claim | `#E879F9` | `Eye` |
| `chair` | **Gavel** | weighs evidence and issues the verdict | `#FDE68A` | `Gavel` |

### 1.4 Feature list (IN scope, 4 hours)
**Core (must ship):**
1. Case Board: 12 case files, ambiguity stars, solved status
2. Blind Mode toggle
3. Prediction lock-in (buttons + keys 1/2/3)
4. Jury debate streaming with 5 animated seats
5. Evidence Ledger with clickable `[E#]` citation chips and **server-side citation verification**
6. Verdict ceremony (gavel sound, theme shift, banner)
7. 3D target viewer (3Dmol.js) driven by verdict (pocket focus, ligand tint)
8. 2D specimen viewer (RDKit.js) with toxic substructure highlighting
9. Animated 5-axis radar
10. Reality Reveal + scoring + localStorage scoreboard
11. Tension meter (specialist disagreement) and "Citations verified" HUD

**Differentiators (ship in this order):**
12. Analog Forge with RDKit validation and hallucination counter
13. AI mechanism illustration (OpenAI image model)
14. Voice commands: push-to-talk, transcription, action routing, spoken reply
15. Replay cache (demo insurance)

**Stretch:** shareable replay links (Neon), compare mode, print report, Realtime voice.

### 1.5 OUT of scope (say so out loud to judges)
No docking, no binding-affinity prediction, no efficacy prediction, no patient data. This is **evidence-based hypothesis triage**.

---

## 2. Honest framing (put this on an in-app "About" popover)
- Data comes from PubChem, ChEMBL, UniProt, RCSB PDB, Europe PMC, plus 12 hand-curated case notes. Two cases are **hypothetical** and labelled "illustrative".
- Chemistry flags come from deterministic SMARTS patterns via RDKit. LLMs never count atoms or invent structures unchecked.
- The jury **reasons over the evidence it is shown**. It does not run experiments.
- Illustrations are AI-generated sketches, labelled "illustrative".
- Blind Mode is best-effort. Models may recognise famous drugs from structure.

---

## 3. Pre-flight (T-30 min). Do all of this *before* the clock starts

```bash
# 1. scaffold (accept defaults if prompted about turbopack)
npx create-next-app@latest moleculejury --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
cd moleculejury

# 2. deps
npm i ai@^5 @ai-sdk/openai@^2 openai@^5 zod@^3.25.76 zustand@^5 motion lucide-react 3dmol @rdkit/rdkit
npx shadcn@latest init            # accept defaults (neutral)
npx shadcn@latest add button badge tabs sheet tooltip sonner dialog

# 3. folders
mkdir -p data/evidence data/replays public/pdb public/rdkit public/illus scripts lib/ai lib/chem components app/api/{jury,analogs,illustrate,voice,transcribe,speak}

# 4. git + GitHub + Vercel (import the repo at vercel.com/new; add env vars)
git init && git add -A && git commit -m "scaffold"
```

Then create `.env.local` (and add the same vars in Vercel: Project → Settings → Environment Variables):

```bash
OPENAI_API_KEY=sk-...
MODEL_FAST=gpt-4.1-mini        # specialists, analogs, voice intent
MODEL_SMART=gpt-4.1            # chair
IMAGE_MODEL=gpt-image-1        # falls back to dall-e-3 automatically
NEXT_PUBLIC_DEMO_REPLAY=0      # set 1 to replay cached juries (no API calls)
```

**Notes:**
- `gpt-image-1` may require OpenAI *Organization Verification*. The route falls back to `dall-e-3` automatically.
- Set a **monthly budget cap** in the OpenAI dashboard. The deployed URL is public. One jury run is about 5 model calls (cents).
- Models are env-driven. If you switch to a reasoning model (`gpt-5*`, `o*`), the `temp()` helper in the jury route already omits `temperature`.

**`next.config.ts`** (hackathon-safe: lint and type nits must never block a Vercel deploy):
```ts
import type { NextConfig } from 'next';
const config: NextConfig = {
  eslint: { ignoreDuringBuilds: true },      // remove this line if your Next version warns it is unknown
  typescript: { ignoreBuildErrors: true },
};
export default config;
```

**`types.d.ts`** (repo root):
```ts
declare module '3dmol';
```

**`package.json` scripts:**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "cache": "node scripts/build-cache.mjs",
    "postinstall": "node scripts/copy-rdkit.mjs"
  }
}
```

**`scripts/copy-rdkit.mjs`** (cross-platform):
```js
import fs from 'node:fs'; import path from 'node:path';
const src = 'node_modules/@rdkit/rdkit/dist', dst = 'public/rdkit';
fs.mkdirSync(dst, { recursive: true });
for (const f of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  try { fs.copyFileSync(path.join(src, f), path.join(dst, f)); }
  catch (e) { console.warn('rdkit copy failed:', f, e.message); }
}
```
Run `npm run postinstall`, then `ls -la public/rdkit`. The `.wasm` should be several MB. **Commit `public/rdkit` to git.** If the copy fails, download the same two files from `https://unpkg.com/@rdkit/rdkit/dist/` into `public/rdkit/`.

**Then run the data cache (Section 6.3):** `npm run cache`. Commit `data/` and `public/pdb/`.

---

## 4. Stack (all free/open-source except your OpenAI key)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router + TypeScript, deployed on Vercel Hobby |
| AI | Vercel AI SDK v5 (`ai`, `@ai-sdk/openai`) for structured outputs; `openai` SDK for images, TTS, transcription |
| Chemistry | `@rdkit/rdkit` (WASM, runs in the browser) |
| 3D | `3dmol` |
| UI | Tailwind, shadcn/ui, `motion` (Framer Motion), lucide-react, `zustand` |
| Fonts | `Space_Grotesk` (display) + `JetBrains_Mono` (data) via `next/font/google` |
| External data | PubChem, ChEMBL, UniProt, RCSB PDB, Europe PMC (all keyless) |
| Persistence | `localStorage` (scores). Neon Postgres is stretch only. |

> **API note:** the code targets AI SDK **v5** (`generateObject`, `zod` 3.x). If `npm i` resolves a newer major, pin back with `ai@^5`.
> **Strict schema rule:** OpenAI structured outputs reject `.optional()`, `.min()`, `.max()`. Use `.describe()` for ranges and clamp in code. All schemas below follow this.

---

## 5. Repo tree

```
moleculejury/
├─ app/
│  ├─ layout.tsx                 fonts, <html data-verdict>, Toaster
│  ├─ globals.css                design tokens (Section 11.1)
│  ├─ page.tsx                   <GameShell/> (board → chamber)
│  └─ api/
│     ├─ jury/route.ts           NDJSON streaming debate
│     ├─ analogs/route.ts        analog proposals
│     ├─ illustrate/route.ts     image generation
│     ├─ voice/route.ts          intent routing + spoken reply
│     ├─ transcribe/route.ts     speech-to-text
│     └─ speak/route.ts          text-to-speech
├─ components/
│  ├─ GameShell.tsx   TopBar.tsx   CaseBoard.tsx   CaseCard.tsx
│  ├─ Chamber.tsx     Seat.tsx     PredictDock.tsx  Transcript.tsx
│  ├─ MolViewer3D.tsx Mol2D.tsx    Radar.tsx        VerdictBanner.tsx
│  ├─ EvidenceLedger.tsx  RevealCard.tsx  AnalogForge.tsx  VoiceButton.tsx  Illustration.tsx
│  └─ ui/ (shadcn)
├─ lib/
│  ├─ types.ts   store.ts   evidence.ts   scoring.ts   sfx.ts   rdkit.ts
│  ├─ ai/{schemas.ts,prompts.ts}
│  └─ chem/{alerts.ts,analyze.ts}
├─ data/
│  ├─ seeds.json                 12 cases (Section 6.1)
│  ├─ evidence/{index.json,*.json}   generated
│  └─ replays/{caseId}.json      optional recorded juries
├─ public/{pdb/*.pdb, rdkit/*, illus/*.png}
├─ scripts/{build-cache.mjs,copy-rdkit.mjs}
├─ types.d.ts   next.config.ts   .env.local
```

---

## 6. Data

### 6.1 `data/seeds.json` (12 cases engineered for disagreement)

`truth` is **never** sent to the model. It is used only in Reality Reveal. `spoiler:true` curated items are excluded in Blind Mode. `ambiguity` (1–3) drives the star rating.

```json
[
  {"id":"c01","codename":"CASE-01","name":"Imatinib","pubchemName":"imatinib","smiles":"Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1","targetName":"ABL1 kinase","uniprot":"P00519","antiUniprot":null,"pdb":"1IEP","hypothetical":false,"ambiguity":1,
   "truth":{"verdict":"GO","note":"Approved 2001 for CML; transformed care. Rare, manageable cardiac signal."},
   "curated":[
    {"kind":"pharm","text":"Type-II kinase inhibitor: binds the inactive (DFG-out) conformation of ABL1; also inhibits KIT and PDGFR.","spoiler":false},
    {"kind":"tox","text":"A class-associated cardiac signal (heart failure) is described in the literature; incidence is low.","spoiler":false},
    {"kind":"reg","text":"Approved in 2001 for chronic myeloid leukemia.","spoiler":true}]},

  {"id":"c02","codename":"CASE-02","name":"Gefitinib","pubchemName":"gefitinib","smiles":"COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1","targetName":"EGFR kinase","uniprot":"P00533","antiUniprot":null,"pdb":"2ITY","hypothetical":false,"ambiguity":2,
   "truth":{"verdict":"GO","note":"Approved; indication narrowed to EGFR-mutation-positive NSCLC. Benefit is genotype-dependent."},
   "curated":[
    {"kind":"pharm","text":"ATP-competitive EGFR inhibitor; clinical benefit is concentrated in tumors with activating EGFR mutations.","spoiler":false},
    {"kind":"tox","text":"Rare interstitial lung disease and transaminase elevations have been reported.","spoiler":false},
    {"kind":"reg","text":"Approved in 2003; indication later narrowed to EGFR-mutation-positive NSCLC.","spoiler":true}]},

  {"id":"c03","codename":"CASE-03","name":"Pioglitazone","pubchemName":"pioglitazone","smiles":"CCc1ccc(CCOc2ccc(CC3SC(=O)NC3=O)cc2)nc1","targetName":"PPARγ","uniprot":"P37231","antiUniprot":null,"pdb":"2PRG","hypothetical":false,"ambiguity":3,
   "truth":{"verdict":"CAUTION","note":"Marketed with a boxed warning for heart failure; bladder-cancer signal debated. Benefit and risk coexist."},
   "curated":[
    {"kind":"pharm","text":"Thiazolidinedione PPARγ agonist that improves insulin sensitivity.","spoiler":false},
    {"kind":"tox","text":"Class effects include fluid retention, heart-failure risk and fracture risk.","spoiler":false},
    {"kind":"struct","text":"The bundled PPARγ structure (2PRG) is a related TZD complex (rosiglitazone), not pioglitazone itself.","spoiler":false},
    {"kind":"reg","text":"Marketed with a boxed warning for congestive heart failure; a bladder-cancer signal remains debated.","spoiler":true}]},

  {"id":"c04","codename":"CASE-04","name":"Rosiglitazone","pubchemName":"rosiglitazone","smiles":"CN(CCOc1ccc(CC2SC(=O)NC2=O)cc1)c1ccccn1","targetName":"PPARγ","uniprot":"P37231","antiUniprot":null,"pdb":"2PRG","hypothetical":false,"ambiguity":3,
   "truth":{"verdict":"CAUTION","note":"Contested: 2007 meta-analysis flagged MI risk; later re-adjudication was less conclusive; regulatory actions differed by region and changed over time."},
   "curated":[
    {"kind":"pharm","text":"TZD-class PPARγ agonist with high PPARγ affinity.","spoiler":false},
    {"kind":"tox","text":"Class effects include fluid retention and heart-failure risk.","spoiler":false},
    {"kind":"reg","text":"A 2007 meta-analysis suggested higher myocardial-infarction risk; later trial re-adjudication was less conclusive; regulatory actions differed by region and changed over time.","spoiler":true}]},

  {"id":"c05","codename":"CASE-05","name":"Troglitazone","pubchemName":"troglitazone","smiles":"Cc1c(C)c2c(c(C)c1O)CCC(C)(COc1ccc(CC3SC(=O)NC3=O)cc1)O2","targetName":"PPARγ","uniprot":"P37231","antiUniprot":null,"pdb":"2PRG","hypothetical":false,"ambiguity":2,
   "truth":{"verdict":"NO_GO","note":"Withdrawn in 2000 after severe drug-induced liver injury."},
   "curated":[
    {"kind":"struct","text":"Unlike other glitazones, it carries a vitamin-E-like chromanol tail. No troglitazone co-crystal structure is bundled; the PPARγ structure shown is a related TZD complex.","spoiler":false},
    {"kind":"tox","text":"Proposed liver-injury mechanisms include reactive quinone metabolites and bile-salt-export-pump (BSEP) inhibition.","spoiler":true},
    {"kind":"reg","text":"Withdrawn in 2000 after cases of severe drug-induced liver injury.","spoiler":true}]},

  {"id":"c06","codename":"CASE-06","name":"Rofecoxib","pubchemName":"rofecoxib","smiles":"CS(=O)(=O)c1ccc(cc1)C1=C(c2ccccc2)C(=O)OC1","targetName":"COX-2","uniprot":"P35354","antiUniprot":null,"pdb":"5KIR","hypothetical":false,"ambiguity":2,
   "truth":{"verdict":"NO_GO","note":"Withdrawn in 2004 after long-term trial data showed excess cardiovascular events."},
   "curated":[
    {"kind":"pharm","text":"Highly COX-2-selective diarylheterocycle (methylsulfonyl pharmacophore on a butenolide core).","spoiler":false},
    {"kind":"tox","text":"Selective COX-2 inhibition reduces gastric injury relative to non-selective NSAIDs.","spoiler":false},
    {"kind":"reg","text":"Long-term trial data showed excess cardiovascular events; withdrawn in 2004.","spoiler":true}]},

  {"id":"c07","codename":"CASE-07","name":"Celecoxib","pubchemName":"celecoxib","smiles":"Cc1ccc(cc1)-c1cc(nn1-c1ccc(cc1)S(N)(=O)=O)C(F)(F)F","targetName":"COX-2","uniprot":"P35354","antiUniprot":null,"pdb":"3LN1","hypothetical":false,"ambiguity":3,
   "truth":{"verdict":"CAUTION","note":"Still marketed with boxed warnings for cardiovascular and GI risk; trial evidence mixed and dose-dependent."},
   "curated":[
    {"kind":"pharm","text":"COX-2-selective diaryl pyrazole carrying a primary sulfonamide.","spoiler":false},
    {"kind":"tox","text":"Cardiovascular risk for coxibs is dose-dependent and trial evidence is mixed.","spoiler":true},
    {"kind":"reg","text":"Marketed with boxed warnings for cardiovascular and gastrointestinal risk.","spoiler":true}]},

  {"id":"c08","codename":"CASE-08","name":"Terfenadine","pubchemName":"terfenadine","smiles":"CC(C)(C)c1ccc(cc1)C(O)CCCN1CCC(CC1)C(O)(c1ccccc1)c1ccccc1","targetName":"Histamine H1 receptor","uniprot":"P35367","antiUniprot":"Q12809","antiName":"hERG (KCNH2)","pdb":"3RZE","hypothetical":false,"ambiguity":2,
   "truth":{"verdict":"NO_GO","note":"Withdrawn in the late 1990s: QT prolongation and torsades de pointes, especially with CYP3A4 inhibitors. Its acid metabolite (fexofenadine) replaced it."},
   "curated":[
    {"kind":"pharm","text":"Lipophilic tertiary-amine H1 antihistamine; extensively cleared by CYP3A4 first-pass metabolism to an active carboxylic-acid metabolite.","spoiler":false},
    {"kind":"tox","text":"The parent compound blocks the hERG potassium channel at low concentrations (QT-prolongation liability).","spoiler":true},
    {"kind":"reg","text":"Withdrawn in the late 1990s for torsades de pointes risk, especially with CYP3A4 inhibitors.","spoiler":true}]},

  {"id":"c09","codename":"CASE-09","name":"Fexofenadine","pubchemName":"fexofenadine","smiles":"CC(C)(C(=O)O)c1ccc(cc1)C(O)CCCN1CCC(CC1)C(O)(c1ccccc1)c1ccccc1","targetName":"Histamine H1 receptor","uniprot":"P35367","antiUniprot":"Q12809","antiName":"hERG (KCNH2)","pdb":"3RZE","hypothetical":false,"ambiguity":2,
   "truth":{"verdict":"GO","note":"Marketed since 1996 as a non-sedating, cardiac-safe replacement for terfenadine."},
   "curated":[
    {"kind":"pharm","text":"Carboxylic-acid active metabolite of terfenadine; zwitterionic and poorly brain-penetrant (non-sedating).","spoiler":false},
    {"kind":"tox","text":"Shows weak hERG blockade at therapeutic exposure compared with the parent compound.","spoiler":true},
    {"kind":"reg","text":"Marketed since 1996 as a safer replacement for terfenadine.","spoiler":true}]},

  {"id":"c10","codename":"CASE-10","name":"Thalidomide","pubchemName":"thalidomide","smiles":"O=C1CCC(N2C(=O)c3ccccc3C2=O)C(=O)N1","targetName":"Cereblon (CRBN)","uniprot":"Q96SW2","antiUniprot":null,"pdb":"4CI1","hypothetical":false,"ambiguity":3,
   "truth":{"verdict":"CAUTION","note":"Caused severe birth defects in the 1950s–60s; later re-approved for specific indications under strict risk-management programs."},
   "curated":[
    {"kind":"pharm","text":"Phthalimide–glutarimide scaffold that binds cereblon and reshapes E3-ligase substrate selection.","spoiler":false},
    {"kind":"struct","text":"The chiral centre racemizes under physiological conditions; enantiomers cannot be safely separated.","spoiler":false},
    {"kind":"reg","text":"Caused severe birth defects in the 1950s–60s; later re-approved for specific indications under strict risk-management programs.","spoiler":true}]},

  {"id":"c11","codename":"CASE-11","name":"4-Nitrochalcone (hypothetical hit)","pubchemName":null,"smiles":"O=C(C=Cc1ccc(cc1)[N+](=O)[O-])c1ccccc1","targetName":"ABL1 kinase (putative)","uniprot":"P00519","antiUniprot":null,"pdb":"1IEP","hypothetical":true,"ambiguity":1,
   "truth":{"verdict":"NO_GO","note":"Aromatic nitro plus enone: textbook reactive/mutagenic alerts; an early-discard compound."},
   "curated":[
    {"kind":"pharm","text":"Illustrative phenotypic-screen hit with no ChEMBL bioactivity record. Putative target ABL1; reference structure shown is a known ABL1 inhibitor complex.","spoiler":false}]},

  {"id":"c12","codename":"CASE-12","name":"Catechol-rhodanine (hypothetical hit)","pubchemName":null,"smiles":"O=C1NC(=S)SC1=Cc1ccc(O)c(O)c1","targetName":"ABL1 kinase (putative)","uniprot":"P00519","antiUniprot":null,"pdb":"1IEP","hypothetical":true,"ambiguity":3,
   "truth":{"verdict":"NO_GO","note":"Classic PAINS frequent-hitter: apparent potency is usually assay interference, not true target engagement."},
   "curated":[
    {"kind":"pharm","text":"Illustrative primary biochemical screen: apparent IC50 around 0.4 µM with a steep dose-response. Unvalidated, no orthogonal assay.","spoiler":false}]}
]
```

### 6.2 Ambiguity matrix (why the jury will not say "yes" to everything)

| Case | Pulling toward GO | Pulling toward NO_GO | Expected tension | Reality |
|---|---|---|---|---|
| Imatinib | Potent ABL1, selective type-II binding | Heart-failure note; hERG heuristic fires (basic amine, high logP) | Low–Med | GO |
| Gefitinib | Potent EGFR | hERG heuristic; genotype-dependent benefit; ILD | Med | GO |
| Pioglitazone | PPARγ potency | TZD ring; class fluid retention/HF | **High** | CAUTION |
| Rosiglitazone | Higher PPARγ affinity | Contested CV literature | **High** | CAUTION |
| Troglitazone | TZD potency | Chromanol/quinone, hepatotoxicity | Med–High | NO_GO |
| Rofecoxib | COX-2 selectivity | Butenolide Michael-acceptor alert; CV trials | Med | NO_GO |
| Celecoxib | Selective, potent | Sulfonamide; CV debate | **High** | CAUTION |
| Terfenadine | Potent H1 | hERG pattern + anti-target data | Low–Med | NO_GO |
| Fexofenadine | Potent H1 | Near-identical scaffold to terfenadine (models may over-flag) | Med | GO |
| Thalidomide | CRBN binding | IMiD alert (teratogenic scaffold) | **Highest** | CAUTION |
| 4-Nitrochalcone | Nothing | Nitro + enone alerts, no data | Low | NO_GO |
| Catechol-rhodanine | "Potent" screen hit (Lock supports) | PAINS (Atom vetoes) | **High** (dramatic split) | NO_GO |

### 6.3 `scripts/build-cache.mjs` (run once: `npm run cache`)

Builds `data/evidence/{id}.json`, `data/evidence/index.json`, and downloads PDBs to `public/pdb/`. Fully offline at runtime afterwards. If an API fails, its field is `null` and the curated notes still give the jury something to work with.

```js
import fs from 'node:fs/promises';

const seeds = JSON.parse(await fs.readFile('data/seeds.json', 'utf8'));
const E = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function j(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch (e) {
      if (i === 2) { console.warn('FAIL', url, e.message); return null; }
      await sleep(700 * (i + 1));
    }
  }
}

async function pubchem(name) {
  if (!name) return null;
  const props = 'MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount';
  const d = await j(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${E(name)}/property/${props}/JSON`);
  const p = d?.PropertyTable?.Properties?.[0];
  return p ? { cid: p.CID, mw: +p.MolecularWeight, xlogp: p.XLogP ?? null, tpsa: p.TPSA ?? null, hbd: p.HBondDonorCount, hba: p.HBondAcceptorCount, rotb: p.RotatableBondCount } : null;
}
async function chemblMol(name) {
  if (!name) return null;
  const d = await j(`https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=${E(name)}&limit=5`);
  const m = d?.molecules?.find((x) => x.pref_name?.toLowerCase() === name.toLowerCase()) ?? d?.molecules?.[0];
  return m ? { id: m.molecule_chembl_id, maxPhase: m.max_phase ?? null, withdrawn: !!m.withdrawn_flag, blackBox: !!m.black_box_warning, firstApproval: m.first_approval ?? null } : null;
}
async function chemblTarget(acc) {
  if (!acc) return null;
  const d = await j(`https://www.ebi.ac.uk/chembl/api/data/target.json?target_components__accession=${acc}&limit=10`);
  const t = d?.targets?.find((x) => x.target_type === 'SINGLE PROTEIN') ?? d?.targets?.[0];
  return t?.target_chembl_id ?? null;
}
async function activities(molId, tgtId) {
  if (!molId || !tgtId) return null;
  const d = await j(`https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=${molId}&target_chembl_id=${tgtId}&pchembl_value__isnull=false&limit=100`);
  const a = d?.activities ?? [];
  if (!a.length) return { n: 0, medianPchembl: null, best: null };
  const vals = a.map((x) => parseFloat(x.pchembl_value)).filter(Number.isFinite);
  const best = [...a].sort((x, y) => parseFloat(y.pchembl_value) - parseFloat(x.pchembl_value))[0];
  return { n: a.length, medianPchembl: median(vals), best: { type: best.standard_type, value: best.standard_value, units: best.standard_units, pchembl: parseFloat(best.pchembl_value) } };
}
async function uniprot(acc) {
  if (!acc) return null;
  const d = await j(`https://rest.uniprot.org/uniprotkb/${acc}.json`);
  if (!d) return null;
  return {
    acc,
    gene: d.genes?.[0]?.geneName?.value ?? acc,
    name: d.proteinDescription?.recommendedName?.fullName?.value ?? d.proteinDescription?.submissionNames?.[0]?.fullName?.value ?? acc,
    function: (d.comments?.find((c) => c.commentType === 'FUNCTION')?.texts?.[0]?.value ?? '').slice(0, 280),
  };
}
async function papers(q) {
  const d = await j(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${E(q)}&format=json&pageSize=4&resultType=lite&sort=${E('CITED desc')}`);
  return (d?.resultList?.result ?? []).map((r) => ({ pmid: r.pmid ?? r.id, title: (r.title ?? '').slice(0, 160), year: r.pubYear, journal: r.journalTitle ?? '' }));
}

const index = {};
const pdbDone = new Set();
await fs.mkdir('public/pdb', { recursive: true });

for (const s of seeds) {
  console.log('→', s.id, s.name);
  const nm = s.pubchemName;
  const [pc, cm, tgt, anti] = await Promise.all([pubchem(nm), chemblMol(nm), uniprot(s.uniprot), uniprot(s.antiUniprot)]);
  const tgtId = await chemblTarget(s.uniprot);
  const antiId = await chemblTarget(s.antiUniprot);
  const act = await activities(cm?.id, tgtId);
  const antiAct = await activities(cm?.id, antiId);
  const pap = nm
    ? { efficacy: await papers(`"${nm}" AND (mechanism OR potency OR efficacy)`), safety: await papers(`"${nm}" AND (toxicity OR adverse OR safety)`) }
    : { efficacy: [], safety: [] };
  index[s.id] = { id: s.id, pubchem: pc, chembl: cm, target: tgt, activity: act, antiTarget: anti, antiActivity: antiAct, papers: pap };
  await fs.writeFile(`data/evidence/${s.id}.json`, JSON.stringify(index[s.id], null, 2));

  if (!pdbDone.has(s.pdb)) {
    pdbDone.add(s.pdb);
    try {
      const r = await fetch(`https://files.rcsb.org/download/${s.pdb}.pdb`);
      if (r.ok) await fs.writeFile(`public/pdb/${s.pdb}.pdb`, await r.text());
      else console.warn('PDB fail', s.pdb, r.status);
    } catch (e) { console.warn('PDB fail', s.pdb, e.message); }
  }
  await sleep(300);
}
await fs.writeFile('data/evidence/index.json', JSON.stringify(index));
console.log('done. cases:', Object.keys(index).length, 'pdbs:', [...pdbDone].join(','));
```

**Verify:** `ls public/pdb` shows 7 files (1IEP 2ITY 2PRG 5KIR 3LN1 3RZE 4CI1). `node -e "const i=require('./data/evidence/index.json');console.log(Object.entries(i).map(([k,v])=>k+': act='+(v.activity?.n??'-')+' papers='+(v.papers.efficacy.length+v.papers.safety.length)).join('\n'))"` shows non-zero counts for most real drugs. Hypotheticals (`c11`, `c12`) intentionally show none. A null here is fine, since the app degrades to curated notes. If 4CI1 renders slowly later, drop thalidomide's 3D tab to cartoon only (already the default).

---

## 7. Chemistry engine

### 7.1 `lib/types.ts`
```ts
export type Verdict = 'GO' | 'CAUTION' | 'NO_GO';
export type Role = 'chemist' | 'toxicologist' | 'pharmacologist' | 'skeptic' | 'chair';
export type Severity = 'danger' | 'warn' | 'info';

export interface Alert { id: string; label: string; smarts: string; severity: Severity; why: string; helper?: boolean }
export interface AlertHit extends Omit<Alert, 'smarts'> { matches: { atoms: number[]; bonds: number[] }[] }

export interface ChemResult {
  canonical: string;
  mw: number | null; logp: number | null; tpsa: number | null; hbd: number | null; hba: number | null; rotb: number | null;
  lipinskiViolations: number;
  alerts: AlertHit[];
}

export interface EvidenceItem {
  id: string;            // "E1"...
  source: 'PubChem' | 'ChEMBL' | 'UniProt' | 'RCSB' | 'EuropePMC' | 'RDKit' | 'Curated';
  kind: string;
  text: string;
  domains: (Role | 'all')[];   // which specialists may see it
  spoiler?: boolean;
  url?: string;
}

export interface Subject {
  id: string; name: string; codename: string; smiles: string;
  targetName: string; uniprot: string; antiUniprot?: string | null; antiName?: string; pdb: string;
  hypothetical: boolean; ambiguity: number;
  truth?: { verdict: Verdict; note: string };
  curated?: { kind: string; text: string; spoiler: boolean }[];
  parentId?: string;
  delta?: { alertsRemoved: string[]; alertsAdded: string[]; dLogP: number | null; similarity: number | null; parentName: string };
}
```

### 7.2 `lib/rdkit.ts` (script-tag loader, no bundler pain)
```ts
'use client';
import { useEffect, useState } from 'react';
let p: Promise<any> | null = null;
export function getRDKit(): Promise<any> {
  if (!p) {
    p = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/rdkit/RDKit_minimal.js';
      s.onload = () => (window as any).initRDKitModule({ locateFile: (f: string) => `/rdkit/${f}` }).then(res).catch(rej);
      s.onerror = () => rej(new Error('RDKit script failed to load'));
      document.head.appendChild(s);
    });
  }
  return p;
}
export function useRDKit() {
  const [rd, setRd] = useState<any>(null);
  useEffect(() => { getRDKit().then(setRd).catch(console.error); }, []);
  return rd;
}
```

### 7.3 `lib/chem/alerts.ts` (deterministic toxicophores; the LLM never guesses atoms)
```ts
import type { Alert } from '../types';

export const ALERTS: Alert[] = [
  { id: 'nitro_arom', label: 'Aromatic nitro', smarts: 'c[N+](=O)[O-]', severity: 'danger', why: 'Nitroaromatics can be bioreduced to reactive, mutagenic species.' },
  { id: 'michael', label: 'Michael acceptor (enone)', smarts: '[CX3]=[CX3][CX3]=O', severity: 'warn', why: 'Electrophile that can covalently modify proteins.' },
  { id: 'tzd', label: 'Thiazolidinedione ring', smarts: 'O=C1NC(=O)SC1', severity: 'warn', why: 'TZD class: PPARγ pharmacophore, also linked to fluid-retention and liver flags.' },
  { id: 'catechol', label: 'Catechol', smarts: '[OX2H]c:c[OX2H]', severity: 'danger', why: 'Redox-cycles to reactive quinones; frequent PAINS motif.' },
  { id: 'ene_rhodanine', label: 'Ene-rhodanine', smarts: 'O=C1NC(=S)SC1=[#6]', severity: 'danger', why: 'Classic PAINS: promiscuity and assay interference.' },
  { id: 'aniline', label: 'Free aniline', smarts: '[NX3;H2]c', severity: 'warn', why: 'Can be metabolically activated to reactive intermediates.' },
  { id: 'epoxide', label: 'Epoxide', smarts: 'C1OC1', severity: 'danger', why: 'Strained electrophile; DNA/protein reactivity.' },
  { id: 'quinone', label: 'Quinone', smarts: 'O=C1C=CC(=O)C=C1', severity: 'danger', why: 'Redox cycling and covalent reactivity.' },
  { id: 'thiol', label: 'Free thiol', smarts: '[SX2H]', severity: 'warn', why: 'Reactive; can form disulfides and metal adducts.' },
  { id: 'alkyl_halide', label: 'Alkyl halide', smarts: '[CX4][Cl,Br,I]', severity: 'warn', why: 'Potential alkylating agent.' },
  { id: 'imid', label: 'Phthalimide–glutarimide (IMiD) scaffold', smarts: 'O=C1CCC(C(=O)N1)N1C(=O)c2ccccc2C1=O', severity: 'danger', why: 'Scaffold linked to cereblon binding and teratogenicity.' },
  { id: 'prim_sulfonamide', label: 'Primary sulfonamide', smarts: 'S(=O)(=O)[NX3;H2]', severity: 'info', why: 'Sulfonamide hypersensitivity is possible in some patients.' },
  // helpers: used only to derive the hERG heuristic, never shown directly
  { id: 'basic_amine', label: 'Basic tertiary amine', smarts: '[NX3;H0;!$(N-C=[O,S,N]);!$(N-a);!$(N-S(=O)=O)]([CX4])([CX4])[CX4]', severity: 'info', why: 'helper', helper: true },
  { id: 'cooh', label: 'Carboxylic acid', smarts: '[CX3](=O)[OX2H1]', severity: 'info', why: 'helper', helper: true },
];

export const HERG_RULE = { logpMin: 3.5 }; // basic amine AND logP > 3.5 AND no carboxylic acid → flag
```

### 7.4 `lib/chem/analyze.ts`
```ts
import { ALERTS, HERG_RULE } from './alerts';
import type { AlertHit, ChemResult } from '../types';

const num = (x: any) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function analyze(RDKit: any, smiles: string): ChemResult | null {
  const mol = RDKit.get_mol(smiles);
  if (!mol || (mol.is_valid && !mol.is_valid())) { mol?.delete?.(); return null; }
  try {
    const d = JSON.parse(mol.get_descriptors());
    const mw = num(d.amw ?? d.exactmw), logp = num(d.CrippenClogP), tpsa = num(d.tpsa);
    const hbd = num(d.NumHBD ?? d.lipinskiHBD), hba = num(d.NumHBA ?? d.lipinskiHBA), rotb = num(d.NumRotatableBonds);
    const lipinskiViolations =
      (mw != null && mw > 500 ? 1 : 0) + (logp != null && logp > 5 ? 1 : 0) +
      (hbd != null && hbd > 5 ? 1 : 0) + (hba != null && hba > 10 ? 1 : 0);

    const hits: Record<string, AlertHit> = {};
    for (const a of ALERTS) {
      try {
        const q = RDKit.get_qmol(a.smarts);
        const raw = JSON.parse(mol.get_substruct_matches(q));
        q.delete();
        const matches = Array.isArray(raw) ? raw : [];
        if (matches.length) { const { smarts, ...rest } = a; hits[a.id] = { ...rest, matches }; }
      } catch (e) { console.warn('bad SMARTS', a.id, e); }
    }
    // derived hERG heuristic
    if (hits.basic_amine && !hits.cooh && logp != null && logp > HERG_RULE.logpMin) {
      hits.herg_pattern = {
        id: 'herg_pattern', label: 'hERG-liability pattern (basic amine + lipophilic, no acid)', severity: 'warn',
        why: 'Lipophilic basic amines often block the hERG channel (QT risk). Heuristic, not a measurement.',
        matches: hits.basic_amine.matches,
      };
    }
    const alerts = Object.values(hits).filter((h) => !h.helper);
    return { canonical: mol.get_smiles(), mw, logp, tpsa, hbd, hba, rotb, lipinskiViolations, alerts };
  } finally { mol.delete(); }
}

export function tanimoto(RDKit: any, a: string, b: string): number | null {
  try {
    const ma = RDKit.get_mol(a), mb = RDKit.get_mol(b);
    const opts = JSON.stringify({ radius: 2, nBits: 1024 });
    const fa: string = ma.get_morgan_fp(opts), fb: string = mb.get_morgan_fp(opts);
    ma.delete(); mb.delete();
    let both = 0, either = 0;
    for (let i = 0; i < fa.length; i++) { const x = fa[i] === '1', y = fb[i] === '1'; if (x && y) both++; if (x || y) either++; }
    return either ? both / either : null;
  } catch { return null; }
}
```

**Acceptance test (browser console after loading RDKit):** `analyze(rd, TERFENADINE_SMILES).alerts.map(a=>a.id)` includes `herg_pattern`; the same call for fexofenadine does **not**; troglitazone includes `tzd`; rhodanine includes `ene_rhodanine` and `catechol`; nitrochalcone includes `nitro_arom` and `michael`; thalidomide includes `imid`. If a descriptor key is `null`, `console.log(JSON.parse(mol.get_descriptors()))` and adjust the key names in `analyze.ts` (RDKit versions differ slightly).

### 7.5 `lib/scoring.ts` (deterministic radar axes; LLM supplies only safety and selectivity)
```ts
import type { ChemResult } from './types';
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export function baseScores(chem: ChemResult | null, packet: any | null, curatedCount: number) {
  const med = packet?.activity?.medianPchembl ?? null;
  const potency = med == null ? 0 : clamp(((med - 4) / 5) * 100);
  const druglikeness = chem
    ? clamp(100 - 25 * chem.lipinskiViolations - ((chem.tpsa ?? 0) > 140 ? 15 : 0) - ((chem.rotb ?? 0) > 10 ? 10 : 0))
    : 0;
  const n = (packet?.activity?.n ?? 0) + (packet?.papers?.efficacy?.length ?? 0) + (packet?.papers?.safety?.length ?? 0) + curatedCount;
  const evidence = clamp((Math.log10(1 + n) / Math.log10(201)) * 100);
  return { potency, druglikeness, evidence };
}
```

---

## 8. Evidence layer: `lib/evidence.ts`

Builds numbered, source-tagged evidence items. The jury may cite only these ids, and the server verifies every citation.

```ts
import type { ChemResult, EvidenceItem, Subject } from './types';

type Draft = Omit<EvidenceItem, 'id'>;
const KIND_DOMAIN: Record<string, EvidenceItem['domains']> = {
  pharm: ['pharmacologist'], tox: ['toxicologist'], reg: ['toxicologist', 'pharmacologist'], struct: ['chemist', 'pharmacologist'],
};

export function buildEvidence(subject: Subject, chem: ChemResult | null, packet: any | null, blind: boolean): EvidenceItem[] {
  const d: Draft[] = [];

  if (packet?.pubchem) {
    const p = packet.pubchem;
    d.push({ source: 'PubChem', kind: 'property', domains: ['chemist'], url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.cid}`,
      text: `PubChem properties: MW ${p.mw}, XLogP ${p.xlogp ?? 'n/a'}, TPSA ${p.tpsa ?? 'n/a'}, HBD ${p.hbd}, HBA ${p.hba}, rotatable bonds ${p.rotb}.` });
  }
  if (chem) {
    d.push({ source: 'RDKit', kind: 'property', domains: ['chemist', 'toxicologist'],
      text: `RDKit computed: MW ${chem.mw?.toFixed(1)}, cLogP ${chem.logp?.toFixed(2)}, TPSA ${chem.tpsa?.toFixed(1)}, HBD ${chem.hbd}, HBA ${chem.hba}, rotatable bonds ${chem.rotb}; Lipinski violations: ${chem.lipinskiViolations}.` });
    if (!chem.alerts.length) d.push({ source: 'RDKit', kind: 'alert', domains: ['chemist', 'toxicologist'], text: 'RDKit structural-alert screen: no alerts matched (screen covers 12 common toxicophores/PAINS motifs only; absence is not proof of safety).' });
    for (const a of chem.alerts)
      d.push({ source: 'RDKit', kind: `alert:${a.id}`, domains: ['chemist', 'toxicologist'], text: `Structural alert [${a.id}] ${a.label} (${a.severity}), ${a.matches.length} match(es). ${a.why}` });
  }
  if (packet?.target) d.push({ source: 'UniProt', kind: 'target', domains: ['pharmacologist'], url: `https://www.uniprot.org/uniprotkb/${packet.target.acc}`,
    text: `Target ${packet.target.gene} (${packet.target.name}). ${packet.target.function}` });
  if (packet?.activity) {
    const a = packet.activity;
    d.push({ source: 'ChEMBL', kind: 'bioactivity', domains: ['pharmacologist', 'toxicologist'],
      text: a.n ? `ChEMBL: ${a.n} activity records vs ${packet.target?.gene ?? 'target'}; median pChEMBL ${a.medianPchembl?.toFixed(2)}; best ${a.best?.type} ${a.best?.value} ${a.best?.units} (pChEMBL ${a.best?.pchembl?.toFixed(2)}).`
        : `ChEMBL: no curated pChEMBL activity records for this compound against ${packet.target?.gene ?? 'the target'}.` });
  } else if (!subject.hypothetical) {
    d.push({ source: 'ChEMBL', kind: 'bioactivity', domains: ['pharmacologist'], text: 'No ChEMBL activity data could be retrieved for this compound.' });
  } else {
    d.push({ source: 'ChEMBL', kind: 'bioactivity', domains: ['pharmacologist', 'toxicologist'], text: 'No bioactivity records exist for this compound in ChEMBL (novel or hypothetical).' });
  }
  if (packet?.antiActivity?.n) {
    const a = packet.antiActivity;
    d.push({ source: 'ChEMBL', kind: 'antitarget', domains: ['toxicologist', 'pharmacologist'],
      text: `Anti-target ${packet.antiTarget?.gene ?? ''}: ${a.n} activity records; median pChEMBL ${a.medianPchembl?.toFixed(2)}; best ${a.best?.type} ${a.best?.value} ${a.best?.units}.` });
  }
  if (packet?.chembl) {
    const c = packet.chembl;
    d.push({ source: 'ChEMBL', kind: 'regulatory', domains: ['toxicologist', 'pharmacologist'], spoiler: true,
      text: `ChEMBL regulatory fields: max phase ${c.maxPhase}, withdrawn flag ${c.withdrawn}, black-box warning ${c.blackBox}, first approval ${c.firstApproval ?? 'n/a'}.` });
  }
  for (const p of packet?.papers?.efficacy ?? []) d.push({ source: 'EuropePMC', kind: 'literature', domains: ['pharmacologist'], url: `https://europepmc.org/search?query=${p.pmid}`, text: `Literature (efficacy/mechanism): "${p.title}" (${p.journal}, ${p.year}, PMID ${p.pmid}).` });
  for (const p of packet?.papers?.safety ?? []) d.push({ source: 'EuropePMC', kind: 'literature', domains: ['toxicologist'], spoiler: true, url: `https://europepmc.org/search?query=${p.pmid}`, text: `Literature (safety): "${p.title}" (${p.journal}, ${p.year}, PMID ${p.pmid}).` });
  d.push({ source: 'RCSB', kind: 'structure', domains: ['pharmacologist', 'chemist'], url: `https://www.rcsb.org/structure/${subject.pdb}`, text: `Reference 3D structure: PDB ${subject.pdb} (ligand-bound complex used for visualization; not a docking result).` });
  for (const c of subject.curated ?? []) d.push({ source: 'Curated', kind: c.kind, domains: KIND_DOMAIN[c.kind] ?? ['all'], spoiler: c.spoiler, text: c.text });

  if (subject.delta) {
    const x = subject.delta;
    d.push({ source: 'RDKit', kind: 'delta', domains: ['all'],
      text: `ANALOG of ${x.parentName} (not a measured compound): alerts removed [${x.alertsRemoved.join(', ') || 'none'}], alerts added [${x.alertsAdded.join(', ') || 'none'}], ΔcLogP ${x.dLogP?.toFixed(2) ?? 'n/a'}, Morgan Tanimoto similarity to parent ${x.similarity?.toFixed(2) ?? 'n/a'}. Activity of the analog is UNMEASURED.` });
  }
  const kept = d.filter((x) => !(blind && x.spoiler));
  return kept.map((x, i) => ({ ...x, id: `E${i + 1}` }));
}

export const forRole = (ev: EvidenceItem[], role: string) => ev.filter((e) => e.domains.includes('all') || e.domains.includes(role as any));
export const fmt = (ev: EvidenceItem[]) => ev.map((e) => `[${e.id}] (${e.source}) ${e.text}`).join('\n');
```

For an **analog**, pass the *parent's* packet (so its target/potency evidence is inherited) plus `subject.delta`. The `delta` item explicitly tells the jury that the analog's activity is unmeasured.

---

## 9. AI layer

### 9.1 `lib/ai/schemas.ts`
```ts
import { z } from 'zod';

export const Stance = z.enum(['SUPPORT', 'CONCERN', 'OPPOSE']);

export const SpecialistOut = z.object({
  stance: Stance,
  confidence: z.number().describe('0 to 1'),
  headline: z.string().describe('max 14 words, punchy, first person'),
  argument: z.string().describe('2-4 sentences, plain English, cite evidence ids like [E3]'),
  citations: z.array(z.string()).describe('evidence ids used, e.g. ["E1","E4"]'),
  flaggedAlertIds: z.array(z.string()).describe('alert ids from the evidence list that worry you, else []'),
  keyUncertainty: z.string().describe('one sentence: the biggest thing you cannot tell from the evidence'),
});

export const SkepticOut = z.object({
  targetRole: z.enum(['chemist', 'toxicologist', 'pharmacologist']),
  stance: Stance,
  confidence: z.number().describe('0 to 1'),
  headline: z.string().describe('max 14 words'),
  attack: z.string().describe('2-4 sentences attacking the single most influential claim; cite [E#]'),
  weakestClaim: z.string().describe('quote or paraphrase the claim being attacked'),
  missingEvidence: z.array(z.string()).describe('2-3 specific data points that would change your mind'),
  citations: z.array(z.string()),
});

export const ChairOut = z.object({
  verdict: z.enum(['GO', 'CAUTION', 'NO_GO']),
  confidence: z.number().describe('0 to 1'),
  headline: z.string().describe('max 14 words, verdict sentence'),
  reasoning: z.string().describe('3-5 sentences weighing evidence quality, citing [E#]'),
  dissent: z.string().describe('the strongest argument AGAINST your verdict, 1-2 sentences'),
  flipConditions: z.array(z.string()).describe('2-3 specific new data points that would flip the verdict'),
  nextExperiments: z.array(z.object({ assay: z.string(), why: z.string(), priority: z.number().describe('1 = first') })).describe('exactly 3'),
  scores: z.object({ safety: z.number().describe('0-100'), selectivity: z.number().describe('0-100') }),
  citations: z.array(z.string()),
  visual: z.object({
    flaggedAlertIds: z.array(z.string()).describe('only ids that appear in the evidence list'),
    cameraFocus: z.enum(['pocket', 'ligand', 'overview']),
    proteinColorMode: z.enum(['chain', 'spectrum', 'bfactor']),
    illustrationPrompt: z.string().describe('max 60 words: a mechanism-of-action scientific illustration, no text or labels'),
  }),
});

export const AnalogsOut = z.object({
  analogs: z.array(z.object({ smiles: z.string(), change: z.string().describe('one short phrase: what was changed'), rationale: z.string().describe('one sentence') })).describe('exactly 4'),
});

export const VoiceOut = z.object({
  action: z.enum(['focus_pocket', 'focus_ligand', 'overview', 'highlight_toxic', 'ask_skeptic', 'suggest_analogs', 'next_case', 'explain', 'none']),
  spokenReply: z.string().describe('max 2 short sentences, conversational'),
});
```

### 9.2 `lib/ai/prompts.ts`
```ts
export const COMMON = `You are one member of a drug-candidate review panel in a game called MoleculeJury.
You see ONLY the numbered evidence items provided. Rules:
1. Argue from your specialty lens only. Do not do other members' jobs.
2. Every factual claim must cite evidence ids like [E3]. If evidence is missing, say so. NEVER invent data, assays, doses, trial results, or atom indices.
3. Be decisive and concise, in plain English a hackathon judge can follow.
4. Stance vocabulary: SUPPORT = advance; CONCERN = advance only with de-risking; OPPOSE = deprioritize.
5. You may use general chemistry/pharmacology principles to interpret the evidence, but do not override it with outside facts.
6. If fewer than 4 relevant evidence items exist, confidence must be <= 0.45.
7. Absence of toxicity data is NOT evidence of safety. Absence of bioactivity data is NOT evidence of potency.
8. If the subject is labelled ANALOG, its activity is unmeasured: reason about structural change only.`;

export const ROLE: Record<string, string> = {
  chemist: `${COMMON}
ROLE: Atom, the Medicinal Chemist. Lens: drug-likeness (Lipinski, TPSA, rotatable bonds), synthetic/chemical liabilities, reactive groups and PAINS.
Veto rule: if any 'danger' structural alert is present, you OPPOSE unless the evidence clearly justifies the group.`,

  toxicologist: `${COMMON}
ROLE: Venom, the Toxicologist. Lens: toxicophores, off-/anti-target liabilities (hERG, liver), class effects, safety literature.
Veto rule: OPPOSE when a danger alert coincides with supporting tox evidence. Note when a pattern is a heuristic rather than a measurement.`,

  pharmacologist: `${COMMON}
ROLE: Lock, the Pharmacologist. Lens: target engagement, potency (pChEMBL: 6 = 1 µM, 8 = 10 nM), selectivity versus anti-targets, structural plausibility.
SUPPORT requires real bioactivity data. With none, you may at most say CONCERN with low confidence. Beware assay-interference (a single steep screen hit is not validation).`,

  skeptic: `${COMMON}
ROLE: Doubt, the Skeptic (red team). You receive all evidence plus the three opening statements.
Pick the single most confident or most influential claim and attack it: a contradiction, an over-reading, a missing control, a heuristic treated as a measurement. List 2-3 missing data points that would change your mind.
Agree with the panel only if you truly cannot find a real weakness (rare).`,

  chair: `${COMMON}
ROLE: Gavel, the Chair. You receive all evidence, the three openings, and the Skeptic's attack. Issue the verdict.
Rules:
- Weigh by evidence quality, not by vote count.
- Verdicts: GO = advance (real activity evidence, no unmitigated severe liability). CAUTION = advance only after specific de-risking (serious positive AND negative evidence both exist and a concrete experiment would resolve it). NO_GO = deprioritize (credible unmitigated liability outweighs benefit, or no benefit evidence plus severe alerts).
- Do NOT default to CAUTION to avoid a decision. Use it only when it is the honest answer.
- 'dissent' = the strongest argument against your own verdict. 'flipConditions' = 2-3 specific new data points that would flip it.
- 'nextExperiments' = exactly 3 standard assays (e.g. hERG patch clamp, HepG2/BSEP liability, Ames, kinase selectivity panel, microsomal stability, orthogonal biophysical binding assay).
- scores.safety and scores.selectivity (0-100) must follow from the evidence; low evidence means mid-range scores and lower confidence.
- visual.flaggedAlertIds: ONLY ids present in the evidence. illustrationPrompt: mechanism-of-action sketch, no text, no logos.
- ANALOGS: verdict GO means "worth synthesizing and testing". Cap confidence at 0.6 because activity is unmeasured.`,

  analogs: `You are a medicinal chemist proposing analogs of a flagged drug candidate.
Goal: remove or mitigate the flagged liabilities while preserving the pharmacophore that engages the target.
Rules: return EXACTLY 4 valid, drug-like SMILES (MW < 550) that differ from the parent by small, chemically sensible edits. Prefer edits known in medicinal chemistry practice (e.g. adding an ionizable acid to cut hERG affinity, blocking a metabolic soft spot, replacing a reactive group with an isostere). Do not propose toxins, controlled substances, or anything intended to cause harm. Each item: smiles, change, rationale.`,

  voice: `You are the Clerk of the MoleculeJury chamber, a brief, warm, confident voice assistant.
Given the user's spoken request and the case context, choose ONE action and a short spoken reply (max 2 sentences).
Mapping: "show pocket/binding site" → focus_pocket; "zoom ligand/drug" → focus_ligand; "reset/overview" → overview; "show the toxic/risky part" → highlight_toxic; "what does the skeptic say / challenge" → ask_skeptic (spokenReply = a one-sentence summary of Doubt's attack from context); "safer analog/fix it" → suggest_analogs; "next case" → next_case; "why / explain" → explain (spokenReply = the Chair's reasoning in one or two plain sentences); otherwise none.
Use only the provided context. Never invent data.`,
};
```

### 9.3 `app/api/jury/route.ts` (NDJSON stream)
```ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SpecialistOut, SkepticOut, ChairOut } from '@/lib/ai/schemas';
import { ROLE } from '@/lib/ai/prompts';
import { fmt, forRole } from '@/lib/evidence';
import type { EvidenceItem } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FAST = process.env.MODEL_FAST ?? 'gpt-4.1-mini';
const SMART = process.env.MODEL_SMART ?? 'gpt-4.1';
const temp = (m: string) => (m.startsWith('gpt-4') ? { temperature: 0.6 } : {});
const c01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0.5));
const c100 = (x: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(x) ? x : 50)));

export async function POST(req: Request) {
  const { subject, evidence, alertIds = [] } = (await req.json()) as {
    subject: { label: string; smiles: string; target: string; isAnalog?: boolean };
    evidence: EvidenceItem[]; alertIds: string[];
  };
  const valid = new Set(evidence.map((e) => e.id));
  let dropped = 0, total = 0;
  const clean = (ids: string[]) => { total += ids.length; const k = ids.filter((i) => valid.has(i)); dropped += ids.length - k.length; return k; };

  const head = `SUBJECT: ${subject.isAnalog ? 'ANALOG ' : ''}${subject.label}\nSMILES: ${subject.smiles}\nTARGET: ${subject.target}\n`;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        send({ t: 'phase', phase: 'opening' });
        const roles = ['chemist', 'toxicologist', 'pharmacologist'] as const;
        const openings: Record<string, any> = {};

        await Promise.all(roles.map(async (role) => {
          send({ t: 'thinking', role });
          const { object } = await generateObject({
            model: openai(FAST), schema: SpecialistOut, system: ROLE[role], ...temp(FAST),
            prompt: `${head}\nEVIDENCE YOU CAN SEE:\n${fmt(forRole(evidence, role))}`,
          });
          object.confidence = c01(object.confidence);
          object.citations = clean(object.citations);
          object.flaggedAlertIds = object.flaggedAlertIds.filter((a) => alertIds.includes(a));
          openings[role] = object;
          send({ t: 'speak', role, data: object });
        }));

        send({ t: 'phase', phase: 'crossexam' });
        send({ t: 'thinking', role: 'skeptic' });
        const sk = await generateObject({
          model: openai(FAST), schema: SkepticOut, system: ROLE.skeptic, ...temp(FAST),
          prompt: `${head}\nALL EVIDENCE:\n${fmt(evidence)}\n\nOPENING STATEMENTS:\n${JSON.stringify(openings, null, 1)}`,
        });
        sk.object.confidence = c01(sk.object.confidence);
        sk.object.citations = clean(sk.object.citations);
        send({ t: 'speak', role: 'skeptic', data: sk.object });

        send({ t: 'phase', phase: 'verdict' });
        send({ t: 'thinking', role: 'chair' });
        const ch = await generateObject({
          model: openai(SMART), schema: ChairOut, system: ROLE.chair, ...temp(SMART),
          prompt: `${head}\nALL EVIDENCE:\n${fmt(evidence)}\n\nOPENING STATEMENTS:\n${JSON.stringify(openings, null, 1)}\n\nSKEPTIC:\n${JSON.stringify(sk.object, null, 1)}`,
        });
        const v = ch.object;
        v.confidence = c01(v.confidence);
        v.scores = { safety: c100(v.scores.safety), selectivity: c100(v.scores.selectivity) };
        v.citations = clean(v.citations);
        v.visual.flaggedAlertIds = v.visual.flaggedAlertIds.filter((a) => alertIds.includes(a));
        v.nextExperiments = v.nextExperiments.slice(0, 3);
        send({ t: 'verdict', data: v, citations: { total, dropped } });
      } catch (e: any) {
        send({ t: 'error', message: e?.message ?? 'jury failed' });
      } finally { send({ t: 'done' }); ctrl.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
```

### 9.4 `app/api/analogs/route.ts`
```ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { AnalogsOut } from '@/lib/ai/schemas';
import { ROLE } from '@/lib/ai/prompts';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { parentName, parentSmiles, flagged, verdict, reasoning } = await req.json();
    const { object } = await generateObject({
      model: openai(process.env.MODEL_FAST ?? 'gpt-4.1-mini'), schema: AnalogsOut, system: ROLE.analogs,
      prompt: `PARENT: ${parentName}\nSMILES: ${parentSmiles}\nVERDICT: ${verdict}\nFLAGGED LIABILITIES: ${JSON.stringify(flagged)}\nJURY REASONING: ${reasoning}\nPropose 4 analogs.`,
    });
    return Response.json(object);
  } catch (e: any) { return Response.json({ error: e?.message ?? 'analog failed' }, { status: 500 }); }
}
```
**Client-side validation (in `AnalogForge.tsx`)** is the rigor moment. For each proposed SMILES: (1) `analyze()` returns `null` → mark **INVALID** (show red "rejected by RDKit"); (2) canonical equals parent's → "duplicate"; (3) `tanimoto < 0.35` → "too different"; (4) else compute `alertsRemoved/alertsAdded/dLogP` and show a card. HUD shows **"Proposed 4 · Valid 3 · Accepted 2"**.

### 9.5 `app/api/illustrate/route.ts`
```ts
import OpenAI from 'openai';
export const maxDuration = 60;
const client = new OpenAI();
const STYLE = 'Clean editorial scientific illustration, dark navy background, glowing line-art, mechanism-of-action diagram, abstract molecules and a receptor, no text, no labels, no logos, no people. ';

export async function POST(req: Request) {
  const { prompt, verdict } = await req.json();
  const palette = verdict === 'GO' ? 'emerald green accents' : verdict === 'NO_GO' ? 'crimson red accents' : 'amber accents';
  const full = `${STYLE}${palette}. Subject: ${String(prompt).slice(0, 400)}`;
  try {
    const r = await client.images.generate({ model: process.env.IMAGE_MODEL ?? 'gpt-image-1', prompt: full, size: '1024x1024', quality: 'low', n: 1 } as any);
    const b64 = (r as any).data?.[0]?.b64_json;
    if (b64) return Response.json({ b64 });
    throw new Error('no image');
  } catch {
    try {
      const r = await client.images.generate({ model: 'dall-e-3', prompt: full, size: '1024x1024', response_format: 'b64_json', n: 1 } as any);
      return Response.json({ b64: (r as any).data?.[0]?.b64_json });
    } catch (e: any) { return Response.json({ error: e?.message ?? 'image failed' }, { status: 500 }); }
  }
}
```
Render with `<img src={`data:image/png;base64,${b64}`}>` and caption **"Fig. 1: AI-generated illustrative sketch, not experimental data."** Optional: pre-generate illustrations for your 3 demo cases and save to `public/illus/{id}.png`; if the file exists, use it instead of calling the API.

### 9.6 Voice routes
**`app/api/transcribe/route.ts`**
```ts
import OpenAI from 'openai';
export const maxDuration = 30;
const client = new OpenAI();
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('audio') as File;
    const r = await client.audio.transcriptions.create({ file, model: 'gpt-4o-mini-transcribe' });
    return Response.json({ text: r.text });
  } catch (e: any) { return Response.json({ error: e?.message }, { status: 500 }); }
}
```
**`app/api/voice/route.ts`** (intent routing, plus a moderation check on free text)
```ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import OpenAI from 'openai';
import { VoiceOut } from '@/lib/ai/schemas';
import { ROLE } from '@/lib/ai/prompts';
export const maxDuration = 30;
const client = new OpenAI();

export async function POST(req: Request) {
  try {
    const { transcript, context } = await req.json();
    const mod = await client.moderations.create({ model: 'omni-moderation-latest', input: transcript });
    if (mod.results?.[0]?.flagged) return Response.json({ action: 'none', spokenReply: "I can't help with that one." });
    const { object } = await generateObject({
      model: openai(process.env.MODEL_FAST ?? 'gpt-4.1-mini'), schema: VoiceOut, system: ROLE.voice,
      prompt: `CONTEXT:\n${JSON.stringify(context)}\n\nUSER SAID: "${transcript}"`,
    });
    return Response.json(object);
  } catch (e: any) { return Response.json({ action: 'none', spokenReply: 'Sorry, I lost the signal.' }); }
}
```
**`app/api/speak/route.ts`** (per-role voices)
```ts
import OpenAI from 'openai';
export const maxDuration = 30;
const client = new OpenAI();
const VOICE: Record<string, string> = { chemist: 'coral', toxicologist: 'onyx', pharmacologist: 'sage', skeptic: 'echo', chair: 'verse', clerk: 'nova' };

export async function POST(req: Request) {
  try {
    const { text, role = 'clerk' } = await req.json();
    const r = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts', voice: (VOICE[role] ?? 'nova') as any, input: String(text).slice(0, 600),
      instructions: 'Speak clearly and confidently, like a sharp lab colleague. Keep a steady pace.', response_format: 'mp3',
    } as any);
    return new Response(Buffer.from(await r.arrayBuffer()), { headers: { 'Content-Type': 'audio/mpeg' } });
  } catch (e: any) { return Response.json({ error: e?.message }, { status: 500 }); }
}
```

---

## 10. Client state and stream consumer

### 10.1 `lib/store.ts`
```ts
'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role, Subject, Verdict, EvidenceItem, ChemResult } from './types';

export type Seat = { status: 'idle' | 'thinking' | 'done'; out?: any };
export type View = { verdict?: Verdict; focus: 'overview' | 'pocket' | 'ligand'; colorMode: 'chain' | 'spectrum' | 'bfactor'; showAlerts: boolean };
const seats0 = (): Record<Role, Seat> => ({ chemist: { status: 'idle' }, toxicologist: { status: 'idle' }, pharmacologist: { status: 'idle' }, skeptic: { status: 'idle' }, chair: { status: 'idle' } });
const view0: View = { focus: 'overview', colorMode: 'chain', showAlerts: false };

interface S {
  phase: 'board' | 'predict' | 'debate' | 'verdict' | 'reveal';
  subject: Subject | null; blind: boolean; prediction: Verdict | null;
  seats: Record<Role, Seat>; verdict: any | null; evidence: EvidenceItem[]; chem: ChemResult | null; packet: any | null;
  view: View; illustration: string | null; cites: { total: number; dropped: number }; events: any[]; error: string | null;
  score: { human: number; jury: number; rounds: number }; solved: Record<string, { human: boolean; jury: boolean }>;
  toggleBlind: () => void;
  open: (s: Subject, packet: any | null) => void;
  setContext: (chem: ChemResult | null, evidence: EvidenceItem[]) => void;
  predict: (v: Verdict) => void;
  run: () => Promise<void>;
  setView: (v: Partial<View>) => void;
  setIllustration: (b64: string | null) => void;
  reveal: () => void;
  back: () => void;
}

export const useGame = create<S>()(persist((set, get) => ({
  phase: 'board', subject: null, blind: true, prediction: null, seats: seats0(), verdict: null, evidence: [], chem: null, packet: null,
  view: view0, illustration: null, cites: { total: 0, dropped: 0 }, events: [], error: null,
  score: { human: 0, jury: 0, rounds: 0 }, solved: {},
  toggleBlind: () => set((s) => ({ blind: !s.blind })),
  open: (subject, packet) => set({ subject, packet, phase: 'predict', prediction: null, seats: seats0(), verdict: null, view: view0, illustration: null, events: [], error: null, cites: { total: 0, dropped: 0 } }),
  setContext: (chem, evidence) => set({ chem, evidence }),
  predict: (v) => { set({ prediction: v, phase: 'debate' }); get().run(); },
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  setIllustration: (b64) => set({ illustration: b64 }),
  back: () => set({ phase: 'board', subject: null }),

  reveal: () => {
    const { subject, prediction, verdict, score, solved } = get();
    if (!subject?.truth) { set({ phase: 'reveal' }); return; }
    const h = prediction === subject.truth.verdict, j = verdict?.verdict === subject.truth.verdict;
    set({
      phase: 'reveal',
      score: { human: score.human + (h ? 100 : 0) + (h && !j ? 50 : 0), jury: score.jury + (j ? 100 : 0), rounds: score.rounds + 1 },
      solved: { ...solved, [subject.id]: { human: h, jury: j } },
    });
  },

  run: async () => {
    const { subject, evidence, blind, chem } = get();
    if (!subject) return;
    set({ seats: seats0(), verdict: null, events: [], error: null });
    const handle = (ev: any) => {
      get().events.push(ev);
      if (ev.t === 'thinking') set((s) => ({ seats: { ...s.seats, [ev.role]: { status: 'thinking' } } }));
      if (ev.t === 'speak') set((s) => ({ seats: { ...s.seats, [ev.role]: { status: 'done', out: ev.data } } }));
      if (ev.t === 'verdict') {
        const v = ev.data;
        set((s) => ({
          verdict: v, phase: 'verdict', cites: ev.citations,
          seats: { ...s.seats, chair: { status: 'done', out: v } },
          view: { ...s.view, verdict: v.verdict, focus: v.visual.cameraFocus, colorMode: v.visual.proteinColorMode, showAlerts: true },
        }));
      }
      if (ev.t === 'error') set({ error: ev.message, phase: 'predict' });
    };
    try {
      if (process.env.NEXT_PUBLIC_DEMO_REPLAY === '1') {
        const rec = await fetch(`/replays/${subject.id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (rec) { for (const ev of rec) { await new Promise((r) => setTimeout(r, 900)); handle(ev); } return; }
      }
      const res = await fetch('/api/jury', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: { label: blind ? subject.codename : subject.name, smiles: subject.smiles, target: subject.targetName, isAnalog: !!subject.parentId },
          evidence, alertIds: (chem?.alerts ?? []).map((a) => a.id),
        }),
      });
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(JSON.parse(line)); }
      }
    } catch (e: any) { set({ error: e.message, phase: 'predict' }); }
  },
}), { name: 'moleculejury-v1', partialize: (s) => ({ score: s.score, solved: s.solved, blind: s.blind }) }));

if (typeof window !== 'undefined') (window as any).__dumpRun = () => { console.log(JSON.stringify(useGame.getState().events)); };
```

**Replay insurance (do this in the last 30 min):** for each of your 3 demo cases, run a real jury, then in the browser console run `copy(JSON.stringify(__dumpRun ? useGame : 0))`. Simpler: run `__dumpRun()`, copy the printed JSON array, save it as `public/replays/{caseId}.json` (create the folder). Set `NEXT_PUBLIC_DEMO_REPLAY=1` to demo with zero API dependency. The stream consumer replays events at 900 ms intervals, so it looks live.

> Keep `data/replays` out of the build. Replays are served statically from `public/replays/`.

### 10.2 App-level wiring (`GameShell.tsx`)
On `open(subject, packet)` in `CaseCard`/`Chamber` mount: `const rd = useRDKit()` → when `rd` ready: `const chem = analyze(rd, subject.smiles)`; `const ev = buildEvidence(subject, chem, packet, blind)`; `setContext(chem, ev)`. Recompute if `blind` toggles. `packet` comes from `evidenceIndex[subject.id]` (`import evidenceIndex from '@/data/evidence/index.json'`). For analogs, pass the **parent's** packet.

---

## 11. UI/UX

### 11.1 Design system: "Lab Noir"
**Principles:** dark specimen-lab, glass panels, one accent colour that *is* the verdict, motion with purpose (thinking, speaking, ceremony). Monospace for numbers and ids. Zero stock-gradient clutter.

**`app/globals.css`** (append after the Tailwind import):
```css
@property --accent { syntax: '<color>'; inherits: true; initial-value: #7dd3fc; }
@property --glow   { syntax: '<color>'; inherits: true; initial-value: rgba(125,211,252,.22); }

:root {
  --bg: #06080c; --panel: rgba(255,255,255,.045); --line: rgba(255,255,255,.09);
  --ink: #e6edf6; --mute: #8b98ab;
  --accent: #7dd3fc; --glow: rgba(125,211,252,.22);
  transition: --accent .8s ease, --glow .8s ease;
}
[data-verdict='GO']      { --accent: #34d399; --glow: rgba(52,211,153,.26); }
[data-verdict='CAUTION'] { --accent: #fbbf24; --glow: rgba(251,191,36,.26); }
[data-verdict='NO_GO']   { --accent: #fb7185; --glow: rgba(251,113,133,.30); }

html, body { background: var(--bg); color: var(--ink); height: 100%; }
.aura { position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(1100px 520px at 50% -8%, var(--glow), transparent 62%),
              radial-gradient(700px 400px at 90% 110%, var(--glow), transparent 70%); }
.glass { background: var(--panel); border: 1px solid var(--line); backdrop-filter: blur(14px); border-radius: 20px; }
.mono { font-family: var(--font-mono), ui-monospace, monospace; }
.grid-bg { background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 36px 36px; mask-image: radial-gradient(circle at 50% 40%, #000 20%, transparent 75%); }
@media print { .aura, .no-print { display: none !important; } body { background: #fff; color: #000; } }
```

**`app/layout.tsx`** essentials: load `Space_Grotesk` as `--font-display` and `JetBrains_Mono` as `--font-mono`; `<body className="font-display antialiased">`; render `<div className="aura"/>` and `<Toaster/>`; sync the verdict to the root so the whole app re-themes:
```tsx
// in GameShell (client): 
useEffect(() => { document.documentElement.dataset.verdict = view.verdict ?? ''; }, [view.verdict]);
```

**Role colour map (`lib/ui.ts`):**
```ts
export const CAST = {
  chemist:        { name: 'Atom',   title: 'Medicinal Chemist', color: '#22D3EE' },
  toxicologist:   { name: 'Venom',  title: 'Toxicologist',      color: '#FB923C' },
  pharmacologist: { name: 'Lock',   title: 'Pharmacologist',    color: '#60A5FA' },
  skeptic:        { name: 'Doubt',  title: 'Skeptic',           color: '#E879F9' },
  chair:          { name: 'Gavel',  title: 'Chair',             color: '#FDE68A' },
} as const;
export const STANCE_COLOR = { SUPPORT: '#34d399', CONCERN: '#fbbf24', OPPOSE: '#fb7185' } as const;
```

### 11.2 Screens and flow

```
BOARD ──click case──▶ PREDICT ──lock-in──▶ DEBATE ──chair──▶ VERDICT ──"Reveal reality"──▶ REVEAL
  ▲                                                              │                          │
  └─────────────────────── next case / back ◀────────────────────┴────── Analog Forge ◀─────┘
```

**Board:** 12 `CaseCard`s in a responsive grid (`grid-cols-2 md:grid-cols-3 xl:grid-cols-4`). Each card: 2D specimen (RDKit, paper-white tile), codename (name hidden in Blind Mode), target chip, ambiguity as 1–3 flame/star icons, and a solved badge (✓ you / ✓ jury) from `solved`. Hover: tile lifts, border glows. Header: logo, Blind toggle, scoreboard, "Custom case" dialog.

**Chamber (desktop wireframe):**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar: ◀ Board · CASE-07 · [Blind ●] · Score You 250 | Jury 300 · ⚖ Tension ▓▓▓░ · ✔ Cites 9/9 │
├──────────────────────────────────────────────────────────────────────────┤
│        (Atom)   (Venom)    ((GAVEL))    (Lock)    (Doubt)                │  ← seats arc, Gavel raised/larger
│      speech     speech     VERDICT      speech    speech                 │
├───────────────────────────────┬──────────────────────────────────────────┤
│                               │  [2D Specimen]   [Radar]                 │
│    3D TARGET (3Dmol)          │  Evidence Ledger (scroll, [E#] chips)    │
│    verdict-tinted ligand      │  Illustration (Fig. 1)                   │
│                               │                                          │
├───────────────────────────────┴──────────────────────────────────────────┤
│ PredictDock: [1 GO] [2 CAUTION] [3 NO_GO]    ·  🎙 hold to talk          │
└──────────────────────────────────────────────────────────────────────────┘
```
Mobile: seats become a horizontal scroll-snap row; 3D / 2D / Radar / Ledger become tabs.

### 11.3 Components (specs + code for the hard parts)

#### `Seat.tsx` (spec)
Props: `{ role: Role, status: 'idle'|'thinking'|'done', out?: any, big?: boolean }`.
- Orb: 72 px circle (Gavel 96 px), background `color-mix(in srgb, {color} 18%, transparent)`, border `{color}55`, lucide icon centered, callsign + title beneath in `mono` small caps.
- **idle:** slow breathing glow (`animate={{ scale: [1, 1.03, 1] }}` 4 s loop).
- **thinking:** two orbiting dots on a ring (`animate={{ rotate: 360 }}` linear 1.2 s loop) plus an animated "···" bubble.
- **done:** ring snaps solid; **stance chip** (SUPPORT/CONCERN/OPPOSE in `STANCE_COLOR`) pops in with a spring; **confidence ring** (SVG circle `strokeDashoffset` animated to `confidence`); speech bubble types `out.headline` at 18 ms/char via `useTypewriter`, then reveals `out.argument` on click or hover (expand).
- Citations in the argument render as clickable chips `[E3]` that open the Ledger scrolled to that item. Parse with `/\[E(\d+)\]/g`.
- For the Chair, stance is replaced by the **verdict stamp**.

```tsx
// useTypewriter
export function useTypewriter(text: string, ms = 18) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); if (!text) return; const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 1)), ms); return () => clearInterval(t); }, [text, ms]);
  return text.slice(0, n);
}
```

#### `MolViewer3D.tsx` (full code: verdict-driven 3D)
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import type { View } from '@/lib/store';

const TINT = { GO: '#34d399', CAUTION: '#fbbf24', NO_GO: '#fb7185' } as const;
const IGNORE = new Set(['HOH', 'SO4', 'GOL', 'EDO', 'NAG', 'PO4', 'CL', 'NA', 'MG', 'ZN', 'ACT', 'DMS', 'BMA', 'MAN', 'FUC', 'PEG', 'TRS', 'CA', 'K']);

function findLigand(model: any) {
  const hets = model.selectedAtoms({ hetflag: true }).filter((a: any) => !IGNORE.has(a.resn));
  const g = new Map<string, { resn: string; chain: string; resi: number; n: number }>();
  for (const a of hets) { const k = `${a.resn}:${a.chain}:${a.resi}`; const e = g.get(k) ?? { resn: a.resn, chain: a.chain, resi: a.resi, n: 0 }; e.n++; g.set(k, e); }
  return [...g.values()].sort((a, b) => b.n - a.n)[0] ?? null;
}

function apply(viewer: any, lig: any, view: View) {
  const tint = view.verdict ? TINT[view.verdict] : '#7dd3fc';
  viewer.setStyle({}, view.colorMode === 'spectrum' ? { cartoon: { color: 'spectrum', opacity: 0.9 } }
    : view.colorMode === 'bfactor' ? { cartoon: { colorscheme: { prop: 'b', gradient: 'roygb', min: 100, max: 0 }, opacity: 0.9 } }
    : { cartoon: { colorscheme: 'chain', opacity: 0.8 } });
  let focus: any = {};
  if (lig) {
    const ls = { resn: lig.resn, chain: lig.chain, resi: lig.resi };
    const pocket = { byres: true, within: { distance: 5, sel: ls } };
    viewer.addStyle(pocket, { stick: { colorscheme: 'whiteCarbon', radius: 0.14 } });
    viewer.setStyle(ls, { stick: { color: tint, radius: 0.3 } });
    focus = view.focus === 'pocket' ? pocket : view.focus === 'ligand' ? ls : {};
  }
  viewer.zoomTo(focus, 900);
  viewer.render();
}

export default function MolViewer3D({ pdb, view }: { pdb: string; view: View }) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<any>(null), lig = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false; setReady(false);
    (async () => {
      const $3Dmol = await import('3dmol');
      const txt = await (await fetch(`/pdb/${pdb}.pdb`)).text();
      if (dead || !el.current) return;
      el.current.innerHTML = '';
      const v = $3Dmol.createViewer(el.current, { backgroundAlpha: 0 });
      v.addModel(txt, 'pdb');
      lig.current = findLigand(v.getModel());
      viewer.current = v; setReady(true);
    })();
    return () => { dead = true; viewer.current?.clear?.(); viewer.current = null; };
  }, [pdb]);

  useEffect(() => { if (viewer.current) apply(viewer.current, lig.current, view); }, [ready, view.verdict, view.focus, view.colorMode]);
  return <div ref={el} className="relative h-full min-h-[320px] w-full" />;
}
```
`apply` runs on every verdict/focus change, so the camera glides to the pocket and the ligand takes the verdict colour live. Voice commands just call `setView({ focus: 'pocket' })`.

#### `Mol2D.tsx` (full code: toxic substructure highlighting)
```tsx
'use client';
import { useMemo } from 'react';
import { useRDKit } from '@/lib/rdkit';
import type { AlertHit } from '@/lib/types';

const COL = { danger: [1, 0.25, 0.35], warn: [1, 0.7, 0.1], info: [0.3, 0.7, 1] } as const;

export default function Mol2D({ smiles, alerts = [], w = 320, h = 240 }: { smiles: string; alerts?: AlertHit[]; w?: number; h?: number }) {
  const rd = useRDKit();
  const key = alerts.map((a) => a.id).join(',');
  const svg = useMemo(() => {
    if (!rd) return '';
    const m = rd.get_mol(smiles);
    if (!m || (m.is_valid && !m.is_valid())) { m?.delete?.(); return ''; }
    const atoms: number[] = [], bonds: number[] = []; const aC: Record<number, number[]> = {}, bC: Record<number, number[]> = {};
    for (const a of alerts) for (const mt of a.matches) {
      const c = [...COL[a.severity]];
      mt.atoms.forEach((i) => { atoms.push(i); aC[i] = c; });
      mt.bonds?.forEach((i) => { bonds.push(i); bC[i] = c; });
    }
    const out = m.get_svg_with_highlights(JSON.stringify({ width: w, height: h, atoms, bonds, highlightAtomColors: aC, highlightBondColors: bC, backgroundColour: [1, 1, 1, 0] }));
    m.delete(); return out;
  }, [rd, smiles, key, w, h]);
  return <div className="rounded-2xl bg-white/95 p-2 shadow-inner" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```
The specimen sits on a white "slide" tile for readability. If per-atom colours do not render in your RDKit build, drop `highlightAtomColors/BondColors` and use `highlightColour: [1,0.25,0.35]`.

#### `Radar.tsx` (full code: animated 5-axis morph)
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

const AXES = ['Potency', 'Selectivity', 'Drug-likeness', 'Safety', 'Evidence'] as const;

function useTween(target: number[], ms = 800) {
  const [v, setV] = useState(target.map(() => 0)); const from = useRef(v);
  useEffect(() => {
    const start = performance.now(), a = [...from.current]; let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const next = target.map((x, i) => a[i] + (x - a[i]) * e); from.current = next; setV(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target.join(','), ms]);
  return v;
}

export default function Radar({ values, size = 260 }: { values: [number, number, number, number, number]; size?: number }) {
  const v = useTween(values); const c = size / 2, R = size * 0.36;
  const pt = (i: number, r: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const poly = v.map((x, i) => pt(i, (R * x) / 100).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]">
      {[0.25, 0.5, 0.75, 1].map((s) => <polygon key={s} points={AXES.map((_, i) => pt(i, R * s).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,.1)" />)}
      {AXES.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, R)[0]} y2={pt(i, R)[1]} stroke="rgba(255,255,255,.1)" />)}
      <polygon points={poly} fill="var(--accent)" fillOpacity=".22" stroke="var(--accent)" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 8px var(--accent))' }} />
      {AXES.map((l, i) => { const [x, y] = pt(i, R + 18); return <text key={l} x={x} y={y} fill="#8b98ab" fontSize="10" textAnchor="middle" dominantBaseline="middle">{l}</text>; })}
    </svg>
  );
}
```
Values: `[potency, chair.scores.selectivity, druglikeness, chair.scores.safety, evidence]`. Until the verdict arrives, show the deterministic axes only (others 0). That alone animates as the verdict lands.

#### `VerdictBanner.tsx` (spec)
Full-width stamp on verdict: giant `GO / CAUTION / NO-GO` in accent colour (`clamp(48px,9vw,120px)`, tracking tight), scale-in spring from 1.6 to 1 with a 6 px blur-out, plus `thump()` (below). Subtext = `headline`, confidence bar, and a `Dissent` pull-quote. A "Why? " drawer lists `reasoning`, `flipConditions`, `nextExperiments` (3 numbered cards). Auto-collapse to a compact bar after 3.5 s.

#### `EvidenceLedger.tsx` (spec)
Scrollable list of evidence items, each: id chip `E3` (mono), source badge (colour per source), text, optional external link. Items cited by the verdict get an accent left-border. Clicking any `[E#]` chip anywhere scrolls and pulses the item. Header shows **"Citations verified: {total−dropped}/{total}"** (the server-side check). In Blind Mode, a footer says *"N spoiler items hidden until reveal."*

#### `PredictDock.tsx` (spec)
Three large buttons `1 GO` (emerald) / `2 CAUTION` (amber) / `3 NO-GO` (rose) with keyboard shortcuts. Clicking calls `predict(v)`. After lock-in, the dock shows "Locked: {v}" and disables. During `debate` it shows a thin animated progress based on how many seats are `done` (0–5).

#### `RevealCard.tsx` (spec)
A card that flips (rotateY 180°) from "Reality?" to the truth: three columns **You / Jury / Reality** with ✓/✗, the `truth.note`, and points earned (+100, +100, +50 "Beat the Jury"). Buttons: **Analog Forge**, **Next case**. Confetti is optional (CSS-only, 20 spans).

#### `TopBar.tsx` (spec)
Left: logo "MoleculeJury" + back. Center: case codename (real name appears after reveal). Right: Blind toggle, **Score** (`You {human} · Jury {jury}`), **Tension meter**, **Citations verified** pill.
```ts
// tension: disagreement among the three specialists + skeptic, 0-100
const val = (s: string, c: number) => (s === 'SUPPORT' ? 1 : s === 'OPPOSE' ? -1 : 0) * (0.5 + 0.5 * c);
const xs = ['chemist','toxicologist','pharmacologist','skeptic'].map(r => seats[r].out ? val(seats[r].out.stance, seats[r].out.confidence) : null).filter(x => x !== null) as number[];
const mean = xs.reduce((a,b)=>a+b,0)/(xs.length||1);
const tension = Math.round(Math.min(1, Math.sqrt(xs.reduce((a,b)=>a+(b-mean)**2,0)/(xs.length||1))) * 100);
```

### 11.4 Sound (`lib/sfx.ts`)
```ts
export function thump() {
  try {
    const C = (window.AudioContext || (window as any).webkitAudioContext); const ctx = new C();
    const o = ctx.createOscillator(), g = ctx.createGain(); const t = ctx.currentTime;
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(t + 0.32);
  } catch {}
}
```
Call `thump()` when the verdict event arrives (user has already interacted by clicking Predict, so autoplay is allowed). Add a mute toggle.

### 11.5 Motion rules
- Seat enter: stagger 60 ms, y 12→0, opacity 0→1.
- Verdict: banner stamp → theme transition (`--accent` animates 0.8 s via `@property`) → 3D camera glide (900 ms) → radar tween (800 ms) → illustration fade-in. Sequence them with `setTimeout` 0 / 150 / 300 / 600 ms.
- Respect `prefers-reduced-motion` (skip orbit and typewriter; show text immediately).
- Error states: seat shows a muted "…lost signal" with Retry (calls `run()`).

---

## 12. Voice, illustration, analog forge: wiring

### 12.1 Voice (v1: bulletproof push-to-talk)
Flow: **hold button → MediaRecorder → `/api/transcribe` → `/api/voice` (intent + reply) → dispatch action → `/api/speak` → play**.

```tsx
// components/VoiceButton.tsx (core hook)
'use client';
import { useRef, useState } from 'react';
import { useGame } from '@/lib/store';

export function useVoice(dispatch: (action: string, reply: string) => void) {
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream); chunks.current = [];
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop()); setState('busy');
      const blob = new Blob(chunks.current, { type: mr.mimeType });
      const ext = mr.mimeType.includes('mp4') ? 'mp4' : mr.mimeType.includes('ogg') ? 'ogg' : 'webm';
      const fd = new FormData(); fd.append('audio', new File([blob], `v.${ext}`, { type: mr.mimeType }));
      const { text } = await (await fetch('/api/transcribe', { method: 'POST', body: fd })).json();
      const s = useGame.getState();
      const context = {
        case: s.blind && s.phase !== 'reveal' ? s.subject?.codename : s.subject?.name,
        verdict: s.verdict && { verdict: s.verdict.verdict, headline: s.verdict.headline, reasoning: s.verdict.reasoning, dissent: s.verdict.dissent },
        skeptic: s.seats.skeptic.out && { attack: s.seats.skeptic.out.attack },
        alerts: s.chem?.alerts.map((a) => a.label),
      };
      const r = await (await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text, context }) })).json();
      dispatch(r.action, r.spokenReply); setState('idle');
    };
    mr.start(); rec.current = mr; setState('rec');
  }
  const stop = () => rec.current?.state === 'recording' && rec.current.stop();
  return { state, start, stop };
}

export async function speak(text: string, role = 'clerk') {
  const r = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, role }) });
  if (!r.ok) return;
  const a = new Audio(URL.createObjectURL(await r.blob())); await a.play();
}
```
**Dispatcher (in `Chamber`):**
```ts
const dispatch = (action: string, reply: string) => {
  const { setView } = useGame.getState();
  if (action === 'focus_pocket') setView({ focus: 'pocket' });
  if (action === 'focus_ligand') setView({ focus: 'ligand' });
  if (action === 'overview') setView({ focus: 'overview' });
  if (action === 'highlight_toxic') setView({ showAlerts: true });   // 2D tab pulses; alerts drawn red/amber
  if (action === 'suggest_analogs') openForge();
  if (action === 'next_case') useGame.getState().back();
  speak(reply, action === 'ask_skeptic' ? 'skeptic' : 'clerk');
};
```
Button UX: a floating mic orb (bottom-right) with a pulsing ring while recording; press-and-hold (pointer events) or click-toggle. Show the last transcript as a toast.

**Audio-theatre bonus (15 min):** a "Play debate" button that calls `speak(out.headline, role)` sequentially for chemist → toxicologist → pharmacologist → skeptic → chair. Each role has its own voice, so it feels like a real panel.

### 12.2 Illustration
On `verdict` event: `fetch('/api/illustrate', { prompt: v.visual.illustrationPrompt, verdict: v.verdict })` in the background → `setIllustration(b64)`. UI shows a shimmering placeholder tile until it arrives. If `public/illus/{id}.png` exists, use it immediately (stage-safe).

### 12.3 Analog Forge (`AnalogForge.tsx`)
1. Button **"Suggest safer analogs"** (also voice: "suggest a safer analog") → POST `/api/analogs` `{ parentName, parentSmiles, flagged: chem.alerts.map(a=>({id:a.id,label:a.label})), verdict, reasoning }`.
2. For each result: validate with RDKit (Section 9.4), compute delta using `analyze()` and `tanimoto()` from `analyze.ts`. Render cards: 2D specimen (with remaining alerts highlighted), chips `−1 alert`, `ΔcLogP −1.2`, `sim 0.78`, plus status `VALID / INVALID / DUPLICATE / TOO DIFFERENT`.
3. HUD: **Proposed 4 · Valid n · Accepted m**. Visible hallucination-catching is the credibility moment.
4. Click an accepted analog → create a derived `Subject`: `{ ...parent, id: 'x'+Date.now(), name: 'Analog of '+parent.name, codename: 'ANALOG', smiles: canonical, parentId: parent.id, truth: undefined, hypothetical: true, delta: {...}, curated: [] }`, build evidence with the **parent's packet** and `subject.delta`, then go straight to `debate` (skip prediction). The UI re-themes to the new verdict.

---

## 13. 4-hour timeline with acceptance tests

| Time | Milestone | Acceptance test (must pass before moving on) |
|---|---|---|
| **0:00–0:20** | Deploy skeleton: layout, fonts, `globals.css`, TopBar, empty Board; env vars on Vercel | Vercel URL loads; dark theme + aura visible; `data-verdict` swap changes accent when set manually in devtools |
| **0:20–1:00** | Chem engine + viewers + Board: `rdkit.ts`, `alerts.ts`, `analyze.ts`, `Mol2D`, `MolViewer3D`, `CaseCard` ×12 | Board shows 12 structures; terfenadine has `herg_pattern`, fexofenadine does not; 3D loads imatinib with pocket highlight; no console errors |
| **1:00–1:50** | AI core: schemas, prompts, evidence, `/api/jury`, store, stream consumer, `Seat` ×5, `PredictDock` | Open CASE-12 → predict → seats animate in sequence → chair verdict arrives; Atom OPPOSE and Lock SUPPORT (or CONCERN) on rhodanine; ledger shows citation counts |
| **1:50–2:30** | Verdict ceremony: banner, theme shift, 3D camera/tint, Mol2D highlights from `flaggedAlertIds`, Radar, Ledger, Reveal + scoring | After verdict, theme turns accent colour, 3D glides to pocket, toxic atoms highlighted, radar morphs; Reveal shows You/Jury/Reality; score persists on refresh |
| **2:30–3:00** | Analog Forge | Terfenadine → NO_GO → "safer analogs" → at least one VALID analog; counters show proposed/valid/accepted; re-score runs; UI re-themes |
| **3:00–3:30** | Illustration + Voice | Illustration appears within ~20 s of verdict; hold mic and say "show me the binding pocket" → camera moves + spoken reply; say "what does the skeptic say" → Doubt's voice |
| **3:30–3:50** | Polish, replays, mobile pass, About popover, README | `NEXT_PUBLIC_DEMO_REPLAY=1` plays a recorded jury with Wi-Fi off; mobile tabs work; Lighthouse sanity |
| **3:50–4:00** | Final deploy, backup video, rehearse | Production URL passes the Section 15 demo path twice in a row |

**Rules:** commit after every row. If a row slips by more than 10 minutes, apply the Section 14.3 cut list. Never leave `main` broken. Vercel auto-deploys it.

---

## 14. QA checklist, risks, cut list

### 14.1 QA checklist
- [ ] All 12 cases open; 3D loads for every `pdb` (7 files present)
- [ ] Blind Mode hides names and spoiler evidence; Reveal shows names
- [ ] Every seat finishes; no seat stays "thinking" on error (Retry visible)
- [ ] Citations are verified server-side (HUD shows `x/y`)
- [ ] Verdict not always GO: run CASE-03 (expect CAUTION-ish), CASE-08 (NO_GO), CASE-09 (GO-ish), CASE-12 (NO_GO). **If everything returns the same verdict, the Chair prompt rule "do NOT default to CAUTION" or the evidence filtering is broken. Check `forRole` and that specialists only see their slice.**
- [ ] Analog invalid SMILES are rejected visibly
- [ ] No API key in the client bundle (`grep -r "sk-" .next/static` returns nothing)
- [ ] Works on a fresh incognito window on the production URL

### 14.2 Risks and mitigations
| Risk | Mitigation |
|---|---|
| Venue Wi-Fi or API outage | Replay cache (`NEXT_PUBLIC_DEMO_REPLAY=1`), cached evidence, bundled PDBs |
| Vercel function timeout | `maxDuration = 60`; specialists run in parallel; fast model for 4 of 5 calls; stream so UI feels alive |
| Structured-output schema rejection | No `.optional()/.min()/.max()` in schemas; clamp in code |
| RDKit wasm fails to load | Files committed in `public/rdkit`; unpkg fallback; Board still renders names/targets without structures |
| `get_descriptors` key mismatch | `analyze.ts` uses fallbacks; verify with the acceptance test and fix key names |
| 3Dmol ligand not found | `findLigand` heuristic; if null, viewer shows cartoon only (focus falls back to overview) |
| Model recognises famous drug in Blind Mode | Disclosed in About. The jury is told to reason from evidence, and the game still works for hypotheticals |
| `gpt-image-1` org verification | Automatic `dall-e-3` fallback; pre-generated `public/illus/*.png` |
| Overclaiming science | "Hypothesis triage" framing on-screen and in pitch; illustration labelled AI-generated |
| Cost abuse on public URL | OpenAI budget cap; optional simple in-memory per-IP counter in `/api/jury` |

### 14.3 Cut list (drop in this order if behind)
1. Audio-theatre "Play debate"
2. Illustration (keep the placeholder tile)
3. Voice → keep only a "Ask the Clerk" text box that calls `/api/voice` with typed input
4. Analog Forge scoring → show only validated analog cards (no re-run)
5. Radar → static numbers
6. Gavel sound, confetti, typewriter
**Never cut:** Blind prediction → debate → verdict → Reveal. That loop **is** the product.

---

## 15. Demo script (≈3 minutes)

1. **Hook (15 s):** "90% of drug candidates fail. Most are killed late and expensively. MoleculeJury is a courtroom where five AI specialists argue it out early, with evidence, and you play against them."
2. **Case 08 in Blind Mode (60 s):** Open `CASE-08`, lock in your prediction aloud ("I think CAUTION"). Watch Atom, Venom, Lock speak, Doubt attack, Gavel rule. **NO_GO**: UI turns crimson, camera dives into the pocket, the basic amine lights up. Point at the Ledger: "every claim is a cited, server-verified evidence item".
3. **Voice (20 s):** hold the mic: "Show me the risky part", then "What does the skeptic say?" The Skeptic's own voice answers.
4. **Reveal (15 s):** Reality flips: terfenadine was withdrawn for cardiac toxicity. Score updates.
5. **The wow (50 s):** "Suggest a safer analog." The AI proposes 4 structures, **RDKit rejects the invalid ones live**, an acid-bearing analog survives, and the jury re-scores it. The UI flips to **emerald GO**. Then: "That is almost exactly the real-world fix: its metabolite, fexofenadine, replaced it."
6. **Close (20 s):** open `CASE-12` quickly: "Lock says the screen hit is potent. Atom vetoes it as a PAINS frequent-hitter. That disagreement is the point." Then: "Hypothesis triage, not magic: evidence in, cited verdict out."

**Backups:** `CASE-05` (troglitazone → NO_GO) and `CASE-03` (pioglitazone → CAUTION) as alternates. Pre-run all demo cases once so the replay cache and illustrations exist.

---

## 16. Stretch (only after Section 14.1 is fully green)

### 16.1 Shareable replay links (Neon Postgres, free tier)
```sql
create table runs (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  subject jsonb not null,
  evidence jsonb not null,
  events jsonb not null,          -- the NDJSON events array
  verdict text,
  created_at timestamptz default now()
);
```
`npm i @neondatabase/serverless`, env `DATABASE_URL`. `POST /api/runs` inserts `{case_id, subject, evidence, events, verdict}` and returns `id`; page `/r/[id]` loads the row and feeds `events` through the same `handle()` used for replays. Share button copies `https://<app>/r/<id>`. This reuses the replay path, so it is about 30 minutes.

### 16.2 Compare mode
Two cases side by side with overlaid radars (two polygons, two colours) and a diff of alert lists. Perfect for terfenadine vs fexofenadine.

### 16.3 Print report
`window.print()` with the `@media print` rules already in `globals.css`. One page: structure, verdict, radar, citations, next experiments.

### 16.4 Realtime voice (verify against current OpenAI docs before starting)
Mint an ephemeral key server-side (`POST https://api.openai.com/v1/realtime/client_secrets` with `{ session: { type: 'realtime', model: 'gpt-realtime', audio: { output: { voice: 'marin' } } } }`, using the secret from `OPENAI_API_KEY`); in the browser, create `RTCPeerConnection`, add the mic track, open a data channel `oai-events`, POST the SDP offer to `https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer <ephemeral>` and `Content-Type: application/sdp`, and set the answer as the remote description. Register the same actions as session tools and route `response.function_call_arguments.done` events to `dispatch`. Endpoints and model names have changed between beta and GA. If anything 4xx's, check the docs rather than guessing, and keep the push-to-talk path in Section 12.1 as the fallback.

---

## 17. Master prompt for a coding agent (paste with this file attached)

```
You are building "MoleculeJury" exactly as specified in MOLECULEJURY_BRAIN.md.
Rules:
1. Follow Section 13's order. After each milestone, run its acceptance test and commit.
2. Use the code blocks in the document verbatim where provided; implement the "spec" components exactly as described.
3. Do not add dependencies beyond Section 3. Do not use localStorage except for the zustand persist in store.ts.
4. Never put OPENAI_API_KEY in client code. All model calls go through /app/api routes.
5. All Zod schemas sent to OpenAI must avoid .optional(), .min(), .max().
6. Keep Blind Mode semantics: spoiler evidence and real names are hidden from both the human and the jury until Reveal.
7. If something in the doc conflicts with the installed library version, make the smallest fix and leave a one-line comment explaining it.
8. Prioritize the core loop (predict → debate → verdict → reveal) before any differentiator.
Start with Section 3 (pre-flight), then Milestone 1.
```

---
*End of brain. Build the loop first, polish second, and keep the demo path rehearsed.*

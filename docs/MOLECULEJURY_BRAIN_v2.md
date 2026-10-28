# MoleculeJury: Execution Brain (v2)

> **One-liner:** *Drop in a molecule, protein, structure file, composition or even a photo of a structure. Five AI specialists inspect it, argue about it step by step in a live "chamber", and hand you **GO / CAUTION / NO-GO with percentages**, plus a 3D view that shows exactly **why**.*

**How to use this file:** it is the single source of truth for the build. v2 replaces the "12 pre-written cases + prediction game" design of v1 with a **free-input app**. Keep v1 only for the chemistry code it already contains (v1 §7.2 `rdkit.ts`, §7.3 `alerts.ts`, §7.4 `analyze.ts`, copied **unchanged**) and for its 12 seeds, which are now the **test set**, not the UI. Attach both files when you hand this to a coding agent.

---

## Table of contents
1. The problem and the story
2. What goes in, what comes out
3. The Brain: what the app knows and how it "learned" it
4. The five agents and the discussion protocol
5. Data: what to download, where it is free, how to test
6. Free stack and setup
7. Repo tree
8. Core code
9. UI spec: the Chamber
10. 4-hour plan with acceptance tests
11. Honest limits and cut list
12. Demo script
13. Master prompt for a coding agent
---


## 1. The problem and the story

### 1.1 The problem being solved
Someone has a **thing** (a compound from a screen, a drug name, a protein they might target, a mixture) and one question: **"is this worth pursuing, or will it blow up on me?"**

Today, answering that means opening 6+ databases (PubChem, ChEMBL, UniProt, PDB, Open Targets, FDA labels, literature), running separate toxicity predictors, and reconciling conflicting signals by hand. Existing tools either give a **black-box score with no reasoning**, or **raw data with no judgment**. Late-stage failures (about 90% of candidates fail) are mostly safety and lack of efficacy that were *visible early* to someone who looked at the right evidence together.

### 1.2 What MoleculeJury does about it
It does the "look at everything together and argue about it" step in about a minute:
1. **Understands** whatever you drop in and shows you what it understood (you confirm).
2. **Builds a dossier** from free public databases, deterministic chemistry rules, small trained toxicity models, and a library of known drugs with known outcomes.
3. **Convenes five specialist agents** who each see only their slice of evidence, so they genuinely disagree. They speak in turns, cross-examine each other, and one can change its mind.
4. Returns a **verdict with percentages, an evidence-quality grade, risks, next experiments**, and a **3D explanation** where every reason is clickable and flies the camera to the atoms or residues behind it.

### 1.3 Who it is for
Students and early researchers, biotech founders, and curious scientists who need a **fast, cited, second opinion**. Not clinicians, not patients.

### 1.4 The story (use it for the pitch and the README)
> Maya has a hit from a screen: potent at 0.4 µM. She pastes the SMILES. The chamber opens. **Lock** (pharmacology) says the potency is real and promising. **Atom** (chemistry) flags a catechol-rhodanine, a textbook frequent-hitter, and the 3D view lights up the offending ring. **Venom** (toxicology) agrees and cites a nearest-neighbour precedent that failed for liver injury. **Doubt** (the skeptic) attacks Lock's claim: "Where is the orthogonal assay?" Lock concedes and drops his GO vote from 58 to 31. **Gavel** (chair) rules **NO-GO, 71%, evidence grade MEDIUM**, and lists the three experiments that would change the verdict. Maya just saved a month of chasing an artefact.

### 1.5 What it is not
Not docking, not affinity prediction, not an efficacy or clinical-outcome predictor. It is **evidence-based hypothesis triage**. The percentages are **jury confidence weighted by evidence quality**, not calibrated clinical probabilities. Say this in the About popover.

---

## 2. What goes in, what comes out

### 2.1 Inputs (everything funnels into one `Subject`)

| You drop in | Example | How it is understood | Free tool |
|---|---|---|---|
| **Name** (compound) | `terfenadine`, `Gleevec` | name → PubChem CID → SMILES, ChEMBL id | PubChem, ChEMBL |
| **Name** (protein/gene) | `EGFR`, `hERG`, `P00519` | UniProt search/accession | UniProt |
| **SMILES / InChI / CAS** | `CC(C)(C)c1ccc...` | RDKit parse; invalid → rejected visibly | RDKit.js, PubChem |
| **Structure file** `.sdf .mol` | from PubChem download | molblock → RDKit → SMILES + 3D coords | RDKit.js |
| **Protein file** `.pdb .cif` | `1IEP.pdb` | 3Dmol parse → chains, sequence, ligands (HETATM) | 3Dmol |
| **Sequence** `.fasta` or pasted | `>P00519 ...` | RCSB sequence search → nearest structure; UniProt hit | RCSB Search API |
| **Image** `.png .jpg` (drawn structure, label, ingredient list, screenshot) | photo of a structure | vision LLM extracts name/SMILES/ingredients → **verified by RDKit/PubChem** → shown for your confirmation | Gemini (free tier) |
| **Composition** (typed) | `paracetamol 500mg + caffeine 65mg` | split to components → each resolved | PubChem, openFDA |
| **Molecule + protein pair** | `imatinib` + `ABL1` | two components, jury judges engagement and safety | all of the above |

**Rule for images:** AI reading of drawn structures is unreliable. The app **never trusts it silently**: the extracted SMILES is re-rendered by RDKit next to your original image on the Confirm card, with an "Edit / Looks right" choice.

### 2.2 The `Subject` kinds and what GO / CAUTION / NO-GO means for each

| `kind` | The question the jury answers | GO | CAUTION | NO-GO |
|---|---|---|---|---|
| `small_molecule` | "Should this advance as a drug candidate?" | Credible activity or precedent, no unmitigated severe liability | Serious positive **and** negative evidence coexist; needs named de-risking experiments | Credible unmitigated liability, or no evidence plus severe alerts |
| `protein` | "Is this a tractable, reasonably safe drug **target**?" | Structure + known ligandable pocket + disease link, manageable safety | Tractable but safety/redundancy concerns, or thin disease evidence | Not ligandable, or strong safety liability on inhibition |
| `complex` (molecule + protein) | "Is this molecule a plausible, safe modulator of this target?" | Evidence of engagement + clean safety | Engagement evidence but liabilities, or engagement inferred only | PAINS-type artefact, strong anti-target/safety signal, or no engagement evidence |
| `mixture` | "Is this combination plausible and low-risk to take forward?" | Components individually acceptable, no flagged interactions | Interaction or duplicate-class warnings | A component is NO-GO or a documented dangerous interaction |

### 2.3 The output contract (the only thing the UI renders from)

```json
{
  "call": "NO_GO",
  "percent": { "go": 8, "caution": 21, "nogo": 71 },
  "confidence": 64,
  "evidenceGrade": "MEDIUM",
  "evidenceCoverage": 58,
  "headline": "Potent on paper, but a PAINS motif makes the potency untrustworthy.",
  "reasons": ["...", "...", "..."],
  "risks": ["...", "...", "..."],
  "nextSteps": ["Run an orthogonal biophysical assay (SPR or thermal shift)", "...", "..."],
  "drivers": [
    { "label": "Ene-rhodanine PAINS alert", "delta": -22, "toward": "NO_GO", "anchorId": "alert:ene_rhodanine" },
    { "label": "Apparent IC50 0.4 µM", "delta": 12, "toward": "GO", "anchorId": "overview" }
  ],
  "transcript": [ { "role": "chemist", "say": "...", "go": 10, "caution": 25, "nogo": 65, "cites": ["E4"], "anchor": "alert:ene_rhodanine" } ],
  "citationsVerified": "9/10"
}
```

`percent` always sums to 100. `confidence` and `evidenceGrade` are separate on purpose: a verdict can be 71% NO-GO and still be based on thin evidence, and the UI must say so.

---

## 3. The Brain: what the app knows and how it "learned" it

**No LLM is fine-tuned.** (Not needed, not free, not 4 hours.) The "training" is four concrete, free, auditable things, and the agents reason on top of them.

| Layer | What it is | How it is built | What it contributes |
|---|---|---|---|
| **B1. Rule knowledge base** | ~14 SMARTS toxicophore/PAINS alerts + a hERG pattern rule + Lipinski | Hand-written (v1 §7.3), runs in browser via RDKit.js | Deterministic flags with atom indices (what lights up in 3D) |
| **B2. Trained tox models** | 4 logistic-regression models on Morgan fingerprints: **hERG, Ames mutagenicity, DILI (liver), ClinTox** | Trained once in Google Colab (§5.3) on public TDC/MoleculeNet sets, exported as ~30 KB JSON each, run in the browser | A probability per risk, **shown with its held-out AUC** and an applicability check (out-of-domain is stated, not hidden) |
| **B3. Precedent library** | ~1,500 known compounds labelled `approved`, `withdrawn`, or `tox_failed`, with fingerprints | Built in the same Colab from ChEMBL + ClinTox | "Your molecule's 3 nearest known drugs and what happened to them" |
| **B4. Calibration** | Prior weights and agent weights tuned on the 12-case gold set + a ClinTox holdout | `npm run eval` (§10) | Percentages that are not arbitrary; you can report accuracy honestly |
| **Live retrieval** | PubChem, ChEMBL, UniProt, RCSB, AlphaFold DB, Open Targets, openFDA, Europe PMC | Called at run time (all keyless) | Fresh, cited evidence items `[E#]` |

**Protein side is retrieval plus rules, not trained ML.** Druggability comes from Open Targets tractability, known ligand counts in ChEMBL, structure availability (PDB or AlphaFold with pLDDT), and UniProt binding/active-site annotations.

### 3.1 End-to-end flow

```
 DROP IN (name / SMILES / file / image / composition)
        │
        ▼
 [1 INTAKE]   sniff type → resolve → Subject
        │      image? vision LLM → verify → CONFIRM CARD (you approve)
        ▼
 [2 DOSSIER]  per component, in parallel:
        │      RDKit alerts + descriptors (browser)
        │      B2 tox probabilities + B3 nearest precedents (browser)
        │      PubChem / ChEMBL / UniProt / OpenTargets / openFDA / EuropePMC (server)
        │      structure: PDB or AlphaFold or PubChem 3D conformer
        │      → numbered Evidence [E1..En], Anchors [A..], rule prior, coverage %
        ▼
 [3 CHAMBER]  R0 Gavel opens → R1 Atom, Venom, Lock → R2 Doubt cross-examines
        │      → R3 targeted agent rebuts (may change votes) → R4 Gavel rules
        │      live % bar updates after every turn; camera flies to each cited anchor
        ▼
 [4 VERDICT]  call + percentages + grade + reasons + risks + next steps
               + "Why" panel: click a driver → 3D jumps to the atoms/residues
```

---

## 4. The five agents and the discussion protocol

### 4.1 The cast
Callsigns and colours are unchanged from v1. Lenses adapt to the subject kind.

| Role id | Callsign | Colour | Lens for molecules | Lens for proteins |
|---|---|---|---|---|
| `chemist` | **Atom** | `#22D3EE` | drug-likeness, reactivity, PAINS, sim. to precedents | structure quality, pocket geometry, pLDDT, ligandability |
| `toxicologist` | **Venom** | `#FB923C` | toxicophores, hERG/liver/Ames, label warnings, FAERS signals | safety liabilities on inhibition, expression, class effects |
| `pharmacologist` | **Lock** | `#60A5FA` | potency, selectivity, target engagement, ChEMBL activity | disease association, tractability, known drugs/ligands |
| `skeptic` | **Doubt** | `#E879F9` | red team: attacks the strongest claim on the table | same |
| `chair` | **Gavel** | `#FDE68A` | weighs, rules, writes next steps | same |

### 4.2 Information asymmetry (this is what creates real disagreement)
Every evidence item has `domains`. A specialist's prompt contains **only** items tagged for its role (or `all`). Doubt sees **all** items plus the three specialist turns. Gavel sees everything plus drivers and prior. If every run returns the same verdict, this slicing is broken.

### 4.3 The protocol (6 model calls, 4 visible beats)

| Beat | Who | Call | What happens |
|---|---|---|---|
| R0 | Gavel (UI only) | 0 | Reads out the dossier summary: what it is, evidence coverage, number of alerts. No LLM needed. |
| R1 | Atom, Venom, Lock | 3, parallel, revealed one by one | Each gives a short statement, a vote split (go/caution/nogo summing to 100), confidence, citations, and a 3D anchor |
| R2 | Doubt | 1 | Picks the **strongest** claim and attacks it; names a `target` role |
| R3 | The attacked agent | 1 | Short rebuttal; **may revise votes** (the UI flashes "changed mind") |
| R4 | Gavel | 1 (smart model) | Issues headline, reasons, risks, next steps, own vote split |

### 4.4 How the percentages are computed (deterministic, shown in the UI)
```
agentMix = Σ weight_i · (0.3 + 0.7·confidence_i) · votes_i   (chemist 1.0, toxicologist 1.2, pharmacologist 1.1, skeptic 0.7), normalised
final    = 0.5·agentMix + 0.3·chairVotes + 0.2·rulePrior      (rulePrior = the data-driven drivers, §8.5)
call     = argmax(final)
confidence = min(100, 2·(top − second)) · (0.4 + 0.6·coverage/100)
evidenceGrade = coverage < 25 → LOW, < 60 → MEDIUM, else HIGH   (coverage < 20 shows "INSUFFICIENT EVIDENCE" on the banner)
```
The About popover shows this formula. Tune the weights with `npm run eval` (§10).

---

## 5. Data: what to download, where it is free, how to test

### 5.1 Runtime data (live, keyless, nothing to download)

| Source | Used for | Endpoint (all free) |
|---|---|---|
| PubChem PUG REST | name→CID, properties, SMILES, **3D conformer SDF**, GHS hazard | `pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/property/...` ; 3D: `.../compound/cid/{cid}/record/SDF?record_type=3d` |
| ChEMBL | max phase, withdrawn flag, black-box, drug warnings, bioactivity (pChEMBL), target ligand counts | `www.ebi.ac.uk/chembl/api/data/{molecule,activity,target,drug_warning}.json` |
| UniProt | protein search, function, disease, **binding/active-site features**, FASTA | `rest.uniprot.org/uniprotkb/search`, `/uniprotkb/{acc}.json` |
| RCSB PDB | structure files, sequence-similarity search | `files.rcsb.org/download/{ID}.pdb`, `search.rcsb.org/rcsbsearch/v2/query` |
| AlphaFold DB | predicted structures with pLDDT | `alphafold.ebi.ac.uk/api/prediction/{uniprot}` → `pdbUrl` |
| Open Targets | tractability, **target safety liabilities**, disease associations | GraphQL: `api.platform.opentargets.org/api/v4/graphql` |
| openFDA | boxed warnings, label text, top adverse-event terms | `api.fda.gov/drug/label.json`, `api.fda.gov/drug/event.json` |
| Europe PMC | recent papers (efficacy and safety) | `www.ebi.ac.uk/europepmc/webservices/rest/search` |

FAERS counts are **reports, not causality**. The prompt must say so. Verify Open Targets field names in its GraphQL browser before relying on them, since the schema evolves.

### 5.2 Training data (downloaded once, free)

| Dataset | Size | Trains | Get it |
|---|---|---|---|
| **TDC hERG** | ~650 | B2 hERG model | `pip install PyTDC` → `Tox(name='hERG')` |
| **TDC AMES** | ~7,200 | B2 mutagenicity | `Tox(name='AMES')` |
| **TDC DILI** | ~475 | B2 liver injury | `Tox(name='DILI')` |
| **ClinTox** (MoleculeNet) | ~1,480 | B2 clinical-tox + B3 precedents | `Tox(name='ClinTox', label_name='CT_TOX')` |
| **ChEMBL withdrawn + approved** | ~200 / ~1,500 used | B3 precedents with **names** | ChEMBL REST: `molecule.json?withdrawn_flag=true`, `?max_phase=4` |

If a dataset name is rejected by your PyTDC version, run `from tdc.utils import retrieve_label_name_list` or check the TDC docs; names occasionally change. Optional extra: Tox21 from MoleculeNet if you want more endpoints (not required).

### 5.3 The Brain build: run once in Google Colab (free), about 20 min, **start it during pre-flight**

```python
# Colab cell 1
!pip -q install rdkit PyTDC scikit-learn requests

# Colab cell 2: train B2 models -> JSON
import json, numpy as np, requests, time
from rdkit import Chem, DataStructs
from rdkit.Chem import rdFingerprintGenerator
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from tdc.single_pred import Tox

gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)   # must match RDKit.js get_morgan_fp {radius:2,nBits:2048}
def fp(smi):
    m = Chem.MolFromSmiles(smi)
    return None if m is None else gen.GetFingerprintAsNumPy(m).astype(np.uint8)

TASKS = {'herg': dict(name='hERG'), 'ames': dict(name='AMES'),
         'dili': dict(name='DILI'), 'clintox': dict(name='ClinTox', label_name='CT_TOX')}
out = {}
for key, kw in TASKS.items():
    df = Tox(**kw).get_data()                      # columns: Drug, Y
    X, y = [], []
    for s, lab in zip(df['Drug'], df['Y']):
        f = fp(s)
        if f is not None: X.append(f); y.append(int(lab))
    X, y = np.array(X), np.array(y)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=7)
    clf = LogisticRegression(C=0.3, max_iter=2000, class_weight='balanced').fit(Xtr, ytr)
    auc = roc_auc_score(yte, clf.predict_proba(Xte)[:, 1])
    out[key] = {'auc': round(float(auc), 3), 'n': int(len(y)), 'intercept': float(clf.intercept_[0]),
                'coef': [round(float(c), 3) for c in clf.coef_[0]],
                'train_fps': [''.join(map(str, r)) for r in Xtr[:600]]}   # for applicability-domain check
    print(key, 'AUC', out[key]['auc'], 'n', len(y))
json.dump(out, open('tox_models.json', 'w'))

# Colab cell 3: B3 precedent library
def chembl(params):
    rows, url = [], 'https://www.ebi.ac.uk/chembl/api/data/molecule.json'
    while url and len(rows) < 2500:
        r = requests.get(url, params=params if '?' not in url else None, timeout=60).json()
        rows += r['molecules']; nxt = r['page_meta']['next']
        url = ('https://www.ebi.ac.uk' + nxt) if nxt else None; time.sleep(0.3)
    return rows
prec = []
for label, params in [('withdrawn', {'withdrawn_flag': 'true', 'limit': 1000}),
                      ('approved',  {'max_phase': 4, 'molecule_type': 'Small molecule', 'limit': 1000})]:
    for m in chembl(params):
        smi = (m.get('molecule_structures') or {}).get('canonical_smiles')
        f = fp(smi) if smi else None
        if f is not None:
            prec.append({'name': m.get('pref_name') or m['molecule_chembl_id'], 'label': label, 'smi': smi,
                         'fp': ''.join(map(str, f))})
ct = Tox(name='ClinTox', label_name='CT_TOX').get_data()
for s, lab in zip(ct['Drug'], ct['Y']):
    f = fp(s)
    if f is not None and lab == 1: prec.append({'name': None, 'label': 'tox_failed', 'smi': s, 'fp': ''.join(map(str, f))})
json.dump(prec, open('precedents.json', 'w'))
print(len(prec), 'precedents')
```
Download `tox_models.json` and `precedents.json` into `public/brain/`. Optionally convert each `fp` string to hex to shrink the file (the browser code below accepts bit-strings; size is a few MB, which is fine for a hackathon). **Parity test (mandatory):** compute `get_morgan_fp` for aspirin in RDKit.js and compare with the Python bit string for the same SMILES. If they differ, change `fpSize`/`radius` or `useChirality` until identical, otherwise B2/B3 are silently wrong.

### 5.4 How to get **test inputs** (all free)

| Test | How to get it |
|---|---|
| Names | `terfenadine`, `fexofenadine`, `imatinib`, `troglitazone`, `thalidomide`, `EGFR`, `hERG` |
| SMILES | the 12 SMILES in the gold table below |
| `.sdf` | PubChem compound page → Download → 3D conformer SDF |
| `.pdb` | `https://files.rcsb.org/download/1IEP.pdb` (ABL1 + imatinib-like ligand), `3RZE.pdb` (H1 receptor) |
| `.fasta` | `https://rest.uniprot.org/uniprotkb/P00519.fasta` |
| **Image** | `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/terfenadine/PNG` (clean drawing); then a phone photo of a printed structure and a photo of an OTC ingredient list (hard cases) |
| Composition | `paracetamol 500mg + caffeine 65mg`, `ibuprofen + aspirin` |
| Bad input | `asdfgh`, an invalid SMILES (`C1CC`), a 100 MB file, an empty submit. The app must reject all gracefully |

**Gold test set (the 12 v1 seeds, used only by `npm run eval`, never shown to the jury):**

| # | Name | SMILES source | Expected |
|---|---|---|---|
| 1 | Imatinib | v1 c01 | GO |
| 2 | Gefitinib | c02 | GO |
| 3 | Pioglitazone | c03 | CAUTION |
| 4 | Rosiglitazone | c04 | CAUTION |
| 5 | Troglitazone | c05 | NO_GO |
| 6 | Rofecoxib | c06 | NO_GO |
| 7 | Celecoxib | c07 | CAUTION |
| 8 | Terfenadine | c08 | NO_GO |
| 9 | Fexofenadine | c09 | GO |
| 10 | Thalidomide | c10 | CAUTION |
| 11 | 4-Nitrochalcone (hypothetical) | c11 | NO_GO |
| 12 | Catechol-rhodanine (hypothetical) | c12 | NO_GO |

Copy `data/seeds.json` from v1 §6.1 unchanged and use `smiles` + `truth.verdict`. Add 6 protein cases with expected calls for the protein path: EGFR, ABL1, KCNH2/hERG (as an *anti-target*: expect NO-GO as a drug target), CRBN, a protein with no known ligands and no structure (expect LOW evidence), and a random-sequence FASTA (expect graceful failure).

**Note on honesty:** the gold set drugs are famous, so an LLM may recognise them. That is why the eval also runs on a ClinTox holdout (unnamed SMILES). Report both numbers.

---

## 6. Free stack and setup

| Layer | Choice | Cost |
|---|---|---|
| Framework / hosting | Next.js (App Router, TypeScript) on **Vercel Hobby** | free |
| LLM (primary) | **Google Gemini API free tier** (get a key at aistudio.google.com). Use a Flash-class model; it supports vision and JSON output | free, rate-limited |
| LLM (fallback) | **Groq free tier** (`llama-3.3-70b-versatile`) when Gemini returns 429 | free, rate-limited |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`) + `zod` | free |
| Chemistry | `@rdkit/rdkit` (WASM, browser) | free |
| 3D | `3dmol` | free |
| UI | Tailwind, shadcn/ui, `motion`, `lucide-react`, `zustand` | free |
| Brain training | Google Colab free | free |

**Free-tier caveats (verify at build time):** Gemini free-tier limits and which models are free have changed several times in 2026. Keep model names in env vars and check AI Studio for the current free Flash model. On the free tier, **Google may use your prompts to improve its products**, so do not paste confidential structures in the demo. One analysis uses ~6 calls, so keep one live run at a time and use the Groq fallback.

### 6.1 Pre-flight (T-30 min, before the clock starts)
```bash
npx create-next-app@latest moleculejury --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
cd moleculejury
npm i ai @ai-sdk/google @ai-sdk/groq zod zustand motion lucide-react 3dmol @rdkit/rdkit
npx shadcn@latest init && npx shadcn@latest add button badge tabs sheet tooltip sonner dialog
mkdir -p lib/ai lib/chem components public/brain scripts data app/api/{resolve,dossier,jury}
git init && git add -A && git commit -m scaffold
```
`.env.local` (mirror in Vercel):
```bash
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...                 # optional fallback
GEMINI_FAST=gemini-2.5-flash     # check AI Studio for the current free Flash model
GEMINI_SMART=gemini-2.5-flash    # may point to a Pro model if your quota allows
GROQ_MODEL=llama-3.3-70b-versatile
```
Also from v1 §3: `next.config.ts` (ignore lint/type errors on build), `types.d.ts` (`declare module '3dmol';`), `scripts/copy-rdkit.mjs` + the `postinstall` script, and **commit `public/rdkit`**. Then start the Colab run (§5.3) and drop its two JSON files into `public/brain/`.

---

## 7. Repo tree
```
moleculejury/
├─ app/
│  ├─ layout.tsx  globals.css  page.tsx            (page = <Shell/>)
│  └─ api/
│     ├─ resolve/route.ts     names + image/free-text → Subject candidates
│     ├─ dossier/route.ts     public-DB evidence for a Subject
│     └─ jury/route.ts        NDJSON streaming debate + verdict
├─ components/
│  ├─ Shell.tsx  DropZone.tsx  ConfirmCard.tsx  Chamber.tsx  Seat.tsx
│  ├─ Bubble.tsx  PercentBar.tsx  StageTracker.tsx  Viewer3D.tsx  Mol2D.tsx
│  ├─ VerdictPanel.tsx  WhyPanel.tsx  EvidenceLedger.tsx  About.tsx
├─ lib/
│  ├─ types.ts  store.ts  sniff.ts  sources.ts  evidence.ts  brain.ts  scoring.ts  rdkit.ts
│  ├─ ai/{model.ts,schemas.ts,prompts.ts}
│  └─ chem/{alerts.ts,analyze.ts}                  (copied from v1)
├─ public/{rdkit/*, brain/{tox_models.json,precedents.json}}
├─ data/seeds.json                                 (v1 gold set; eval only)
├─ scripts/{eval.mjs,copy-rdkit.mjs}
```

---

## 8. Core code

### 8.1 `lib/types.ts`
```ts
export type Verdict = 'GO' | 'CAUTION' | 'NO_GO';
export type Kind = 'small_molecule' | 'protein' | 'complex' | 'mixture';
export type Role = 'chemist' | 'toxicologist' | 'pharmacologist' | 'skeptic' | 'chair';
export interface Votes { go: number; caution: number; nogo: number }

export interface Component {
  key: string;                                  // "c0", "c1"
  role: 'ligand' | 'target' | 'ingredient';
  name: string;
  smiles?: string; molblock?: string; cid?: number; chemblId?: string;
  uniprot?: string; gene?: string; sequence?: string; pdbId?: string;
  pdbText?: string;                             // client-only (uploaded file); never sent to the LLM
  note?: string;
}
export interface Subject {
  id: string; kind: Kind; title: string;
  question: string;                             // the kind-specific question from §2.2
  components: Component[];
  origin: 'text' | 'smiles' | 'file' | 'image';
  understood: string;                           // one sentence shown on the Confirm card
  confidence: 'high' | 'medium' | 'low';
}
export interface EvidenceItem { id: string; source: string; kind: string; text: string; domains: (Role | 'all')[]; url?: string }
export interface Anchor {
  id: string; label: string; componentKey: string;
  type: 'atoms' | 'residues' | 'ligand' | 'overview';
  atoms?: number[];                             // indices into the displayed molblock
  residues?: { chain: string; resi: number }[];
  resn?: string;                                // ligand residue name in a PDB
}
export interface Driver { label: string; delta: number; toward: Verdict; anchorId?: string }
export interface Dossier {
  subject: Subject; evidence: EvidenceItem[]; anchors: Anchor[];
  drivers: Driver[]; prior: Votes; coverage: number;      // 0-100
  structure: { componentKey: string; mode: 'pdb' | 'alphafold' | 'conformer' | 'flat' | 'none'; url?: string }[];
}
```

### 8.2 `lib/sniff.ts` (cheap, deterministic input detection, runs in the browser first)
```ts
export type Sniffed = 'pdbid' | 'uniprot' | 'fasta' | 'inchi' | 'cas' | 'smiles' | 'text';
export function sniff(raw: string, rdkit?: any): Sniffed {
  const t = raw.trim();
  if (/^>/.test(t) || /^[ACDEFGHIKLMNPQRSTVWY\s\n]{30,}$/i.test(t.replace(/\n/g, ''))) return 'fasta';
  if (/^InChI=/.test(t)) return 'inchi';
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return 'cas';
  if (/^[1-9][A-Za-z0-9]{3}$/.test(t)) return 'pdbid';
  if (/^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/.test(t)) return 'uniprot';
  if (!/\s/.test(t) && rdkit) { const m = rdkit.get_mol(t); const ok = !!m && (!m.is_valid || m.is_valid()); m?.delete?.(); if (ok) return 'smiles'; }
  return 'text';
}
```
Anything `text` goes to `/api/resolve`. A `+` or comma-separated list with 2+ parts becomes a **mixture** candidate.

### 8.3 `app/api/resolve/route.ts` (spec + key code)
Input: `{ text?: string, imageBase64?: string, mime?: string }`. Output: `{ candidates: Subject[], notes: string }`.

Steps, in order:
1. **Image:** one Gemini vision call with a strict JSON schema `{ items: [{ type: 'compound'|'protein'|'ingredient', name, smiles, confidence }], description }`. Prompt: *"Extract only what is visibly present. If a structure is drawn, give a SMILES only if you are confident, otherwise leave it empty and give your best name guess. Never invent."* Then **verify every item** with steps 2-3 (invalid SMILES → drop the SMILES, keep the name). Set `origin:'image'`, `confidence` ≤ `medium` unless name resolved in PubChem **and** the SMILES parsed.
2. **Compound name:** `PubChem /compound/name/{n}/property/IsomericSMILES,MolecularWeight/JSON` (read the SMILES from any of `IsomericSMILES ?? SMILES ?? CanonicalSMILES ?? ConnectivitySMILES`, because PubChem renamed these keys). Add ChEMBL `molecule/search.json?q=`.
3. **Protein name:** UniProt `search?query={n} AND reviewed:true AND organism_id:9606&fields=accession,gene_primary,protein_name&size=3&format=json`.
4. **Both hit** (e.g. "imatinib" is only a compound, but "histamine" could be both) → return **two candidates** and let the Confirm card ask "compound or protein?".
5. **Mixture:** split on `+`, `,`, newline, strip doses into `note`, resolve each as above, `kind:'mixture'`.
6. **FASTA:** POST RCSB sequence search (`{"query":{"type":"terminal","service":"sequence","parameters":{"evalue_cutoff":0.1,"identity_cutoff":0.9,"sequence_type":"protein","value":"<seq>"}},"return_type":"polymer_entity","request_options":{"paginate":{"start":0,"rows":3}}}`); take the best hit's PDB id and its UniProt. If none, say so and offer ESMFold prediction as a stretch.
7. Build `Subject` with the `question` from §2.2 and a one-sentence `understood`. **If two components are given (molecule + protein), `kind:'complex'`.**

The route returns candidates; **the UI never starts the debate without the user pressing "Convene the jury" on a Confirm card.**

### 8.4 `lib/sources.ts` + `app/api/dossier/route.ts`
`/api/dossier` takes a `Subject`, runs these in `Promise.allSettled` (any failure → `null`, never throw), and returns raw packets. Evidence-item building and numbering happen in `lib/evidence.ts` on the client (so RDKit/ML results join the same list).

Fetchers (each returns `null` on 404/error, 6 s timeout; reuse the retry helper `j()` from v1 §6.3):
- `pubchem(cid|name)`: properties + GHS (`/rest/pug_view/data/compound/{cid}/JSON?heading=GHS+Classification`, optional).
- `chembl(name)`: `molecule/search` → `max_phase`, `withdrawn_flag`, `black_box_warning`; then `drug_warning.json?molecule_chembl_id=` for withdrawal reasons.
- `chemblActivity(molId, targetId)`: v1 §6.3 `activities()` unchanged (median pChEMBL, best activity).
- `chemblTargetLigands(acc)`: count of distinct molecules with pChEMBL ≥ 6 (druggability signal for proteins).
- `uniprot(acc)`: function text, disease comments, and **features of type `Binding site` / `Active site`** → residue numbers (these become 3D anchors).
- `alphafold(acc)`: `api/prediction/{acc}` → `pdbUrl`, `globalMetricValue` (mean pLDDT).
- `openTargets(gene)`: GraphQL `search(queryString:$g, entityNames:["target"]){ hits{ id } }` then `target(ensemblId:$id){ approvedSymbol tractability{ label modality value } safetyLiabilities{ event } associatedDiseases(page:{index:0,size:5}){ rows{ score disease{ name } } } }`.
- `openFda(name)`: `drug/label.json?search=openfda.generic_name:"{name}"&limit=1` → `boxed_warning`, `drug_interactions`; and `drug/event.json?...&count=patient.reaction.reactionmeddrapt.exact&limit=5`.
- `europePmc(q)`: v1 `papers()` unchanged, two queries (efficacy, safety).

### 8.5 `lib/brain.ts` and `lib/scoring.ts`: B2, B3, prior, drivers, coverage
```ts
// lib/brain.ts (browser). Loads the Colab artefacts lazily.
let models: any, prec: any[] | null = null;
export async function loadBrain() {
  if (!models) models = await (await fetch('/brain/tox_models.json')).json();
  if (!prec) prec = await (await fetch('/brain/precedents.json')).json();
}
const bits = (s: string) => s.split('').map((c) => c === '1');
export function fpOf(RDKit: any, smi: string): string | null {
  const m = RDKit.get_mol(smi); if (!m) return null;
  const f = m.get_morgan_fp(JSON.stringify({ radius: 2, nBits: 2048 })); m.delete(); return f;
}
const tani = (a: string, b: string) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const x = a[k] === '1', y = b[k] === '1'; if (x && y) i++; if (x || y) u++; } return u ? i / u : 0; };

export function toxProbs(f: string) {
  const out: Record<string, { p: number; auc: number; inDomain: boolean; maxSim: number }> = {};
  for (const [k, m] of Object.entries<any>(models)) {
    let z = m.intercept; for (let i = 0; i < 2048; i++) if (f[i] === '1') z += m.coef[i];
    const sims = (m.train_fps as string[]).map((t) => tani(f, t)); const maxSim = Math.max(...sims);
    out[k] = { p: 1 / (1 + Math.exp(-z)), auc: m.auc, inDomain: maxSim >= 0.3, maxSim };
  }
  return out;
}
export function nearest(f: string, k = 3) {
  return prec!.map((r) => ({ name: r.name, label: r.label, sim: tani(f, r.fp) })).sort((a, b) => b.sim - a.sim).slice(0, k);
}
```
```ts
// lib/scoring.ts
import type { Driver, Votes } from './types';
const norm = (v: Votes): Votes => { const t = v.go + v.caution + v.nogo || 1; return { go: (v.go / t) * 100, caution: (v.caution / t) * 100, nogo: (v.nogo / t) * 100 }; };

export function moleculePrior(s: { dangerAlerts: {label:string;id:string}[]; warnAlerts: {label:string;id:string}[]; herg: boolean; tox: Record<string,{p:number;auc:number;inDomain:boolean}>;
  nearest: {name:string|null;label:string;sim:number}[]; pchembl: number | null; lipinski: number; withdrawn: boolean; blackBox: boolean }) {
  const v: Votes = { go: 34, caution: 33, nogo: 33 }; const drivers: Driver[] = [];
  const add = (k: keyof Votes, d: number, label: string, anchorId?: string) => { v[k] += d; drivers.push({ label, delta: k === 'go' ? d : -d, toward: k === 'go' ? 'GO' : k === 'nogo' ? 'NO_GO' : 'CAUTION', anchorId }); };
  s.dangerAlerts.slice(0, 2).forEach((a) => add('nogo', 18, a.label + ' (danger alert)', 'alert:' + a.id));
  s.warnAlerts.slice(0, 3).forEach((a) => add('caution', 6, a.label + ' (warning alert)', 'alert:' + a.id));
  if (s.herg) add('nogo', 10, 'hERG-liability pattern', 'alert:herg_pattern');
  for (const [k, t] of Object.entries(s.tox)) if (t.inDomain) {
    if (t.p > 0.6) add('nogo', Math.round(30 * (t.p - 0.5)), `${k.toUpperCase()} model: ${(t.p * 100) | 0}% (AUC ${t.auc})`);
    else if (t.p < 0.3) add('go', 6, `${k.toUpperCase()} model: low risk (${(t.p * 100) | 0}%)`);
  }
  for (const n of s.nearest.filter((x) => x.sim > 0.6)) {
    if (n.label === 'approved') add('go', Math.round(12 * n.sim), `Close to approved ${n.name ?? 'drug'} (sim ${n.sim.toFixed(2)})`);
    else add('nogo', Math.round(15 * n.sim), `Close to ${n.label} ${n.name ?? 'compound'} (sim ${n.sim.toFixed(2)})`);
  }
  if (s.pchembl != null) s.pchembl >= 7 ? add('go', 18, `Potency pChEMBL ${s.pchembl.toFixed(1)}`, 'overview') : s.pchembl < 5 && add('nogo', 8, 'Weak potency');
  else add('caution', 8, 'No potency data');
  if (s.lipinski >= 2) add('caution', 8, `${s.lipinski} Lipinski violations`);
  if (s.withdrawn) add('nogo', 25, 'Withdrawn from market (ChEMBL)');
  if (s.blackBox) add('caution', 12, 'Black-box warning (ChEMBL)');
  (Object.keys(v) as (keyof Votes)[]).forEach((k) => (v[k] = Math.max(2, v[k])));
  return { prior: norm(v), drivers: drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8) };
}
```
Write `proteinPrior` in the same style from: structure exists (+go), mean pLDDT > 80 (+go) / < 60 (+caution), known ligands with pChEMBL ≥ 6 count (≥ 20 → +go, 0 → +nogo), Open Targets small-molecule tractability bucket (+go), `safetyLiabilities` count (≥ 3 → +nogo 15), top disease score ≥ 0.5 (+go) / < 0.1 (+caution), UniProt binding site annotated (+go). `mixturePrior` = worst component's prior with a +10 caution if openFDA `drug_interactions` text mentions another component's name.

**Coverage** (0-100) = filled slots ÷ expected slots × 100.
- molecule slots: PubChem hit, descriptors computed, ≥1 B2 model in-domain, nearest precedent sim > 0.5, ChEMBL record, activity data (if a target exists), papers ≥ 1, FDA label (if ChEMBL phase 4).
- protein slots: UniProt, structure, ≥1 known ligand, tractability, safety liabilities queried, disease associations, papers, binding-site annotation.

### 8.6 `lib/evidence.ts` (numbered, role-tagged evidence)
Same pattern as v1 §8: every fact becomes `{ id:'E#', source, kind, text, domains, url }`, ids assigned in order. Domain tagging:

| Evidence kind | domains |
|---|---|
| RDKit descriptors, alerts, similarity to precedent | `chemist` (alerts also `toxicologist`) |
| B2 tox probabilities (with AUC, in-domain flag in the text) | `toxicologist`, `chemist` |
| Precedent neighbours | `chemist`, `toxicologist` |
| ChEMBL withdrawn / black-box / drug_warning, openFDA boxed warning, FAERS top terms, GHS | `toxicologist` |
| ChEMBL activity, target ligand counts, tractability, disease associations, UniProt function | `pharmacologist` |
| Structure facts (resolution, pLDDT, binding sites) | `chemist`, `pharmacologist` |
| Open Targets safety liabilities | `toxicologist`, `pharmacologist` |
| Europe PMC papers | efficacy → `pharmacologist`; safety → `toxicologist` |
| Overview line (what the subject is, coverage %) | `all` |

Also emit **anchors** here: `overview`; one `alert:{id}` per verified alert hit (atoms from RDKit matches, indices into the molblock actually displayed); `site:{n}` per UniProt binding/active site; `ligand:{RESN}` per co-crystal ligand found in an uploaded/PDB file.

### 8.7 `lib/ai/model.ts`, `schemas.ts`
```ts
// lib/ai/model.ts
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
export async function structured<T>(a: { schema: any; system: string; prompt: string; smart?: boolean }): Promise<T> {
  try {
    const { object } = await generateObject({ model: google(a.smart ? process.env.GEMINI_SMART! : process.env.GEMINI_FAST!), schema: a.schema, system: a.system, prompt: a.prompt });
    return object as T;
  } catch (e) {
    if (!process.env.GROQ_API_KEY) throw e;
    const { object } = await generateObject({ model: groq(process.env.GROQ_MODEL!), schema: a.schema, system: a.system, prompt: a.prompt });
    return object as T;
  }
}
```
```ts
// lib/ai/schemas.ts  (no .optional/.min/.max; clamp in code)
import { z } from 'zod';
export const TurnSchema = z.object({
  say: z.string().describe('2-4 plain-English sentences in character. No markdown.'),
  go: z.number().describe('integer 0-100'),
  caution: z.number().describe('integer 0-100'),
  nogo: z.number().describe('integer 0-100. go+caution+nogo must equal 100'),
  confidence: z.number().describe('integer 0-100: how strongly the evidence you were shown supports your vote'),
  cites: z.array(z.string()).describe('evidence ids like E3 that support what you said'),
  anchor: z.string().describe('one anchor id from the list to show in 3D, or "none"'),
  target: z.string().describe('Skeptic only: chemist | toxicologist | pharmacologist (whose claim you attack). Everyone else: none'),
});
export const ChairSchema = TurnSchema.extend({
  headline: z.string().describe('max 14 words'),
  reasons: z.array(z.string()).describe('exactly 3 short reasons, each naming evidence'),
  risks: z.array(z.string()).describe('exactly 3 short risks'),
  nextSteps: z.array(z.string()).describe('exactly 3 concrete experiments or checks that could change the verdict'),
});
```

### 8.8 `lib/ai/prompts.ts` (the non-negotiable rules)
```ts
export const VERDICT_RULES = `
GO: advance. Real evidence of benefit and no unmitigated severe liability.
CAUTION: advance only after named de-risking experiments. Serious positive AND negative evidence coexist.
NO_GO: deprioritize. A credible unmitigated liability outweighs benefit, OR evidence is absent and alerts are severe.
Do NOT default to CAUTION to be safe. Use the full range of votes. Absence of data is not evidence of safety.`;

export const SYSTEM = (role: string, lens: string, question: string) => `
You are ${role} on a five-person drug-triage jury. Question: ${question}
Your lens: ${lens}
Rules:
- Use ONLY the numbered evidence items you are given. Cite them as [E#] in your cites array. Never invent a number, a paper, a structure or an atom.
- Chemistry flags and model probabilities are deterministic outputs. Quote them, do not recompute or contradict them. ML probabilities are heuristics: mention their AUC and whether they are in-domain.
- FAERS counts are reports, not causation. Say so if you use them.
- If evidence for your lens is thin, say so and lower your confidence.
- You are not a doctor. This is hypothesis triage, not medical advice.
- Stay in character, 2-4 sentences, plain English, no markdown.
${VERDICT_RULES}`;
export const LENS: Record<string, string> = {
  chemist: 'drug-likeness, reactivity, PAINS, structural similarity to known compounds, structure/pocket quality',
  toxicologist: 'toxicophores, hERG/liver/mutagenicity signals, label warnings, adverse-event reports, class effects, target safety liabilities',
  pharmacologist: 'target engagement, potency, selectivity, disease relevance, tractability, existing ligands',
  skeptic: 'RED TEAM. Pick the single strongest claim made so far and attack it with the specific evidence that weakens it or a missing experiment. Name the role you attack in "target".',
  chair: 'weigh all turns, the drivers and the prior; resolve disagreements; give a verdict split; write headline, reasons, risks, next steps. Explain which specialist you sided with and why.',
};
```
The user prompt for each call contains: the subject summary, the evidence slice (`E# [source] text`), the allowed anchor ids with labels, and for later beats the previous turns as `NAME (role): say | votes`.

### 8.9 `app/api/jury/route.ts` (streaming NDJSON; core logic)
```ts
import { structured } from '@/lib/ai/model';
import { TurnSchema, ChairSchema } from '@/lib/ai/schemas';
import { SYSTEM, LENS } from '@/lib/ai/prompts';
import { finalize, cleanTurn } from '@/lib/scoring';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { dossier } = await req.json();
  const ids = new Set<string>(dossier.evidence.map((e: any) => e.id));
  const anchorIds = new Set<string>(['none', ...dossier.anchors.map((a: any) => a.id)]);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: any) => c.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const turns: Record<string, any> = {};
      const slice = (r: string) => dossier.evidence.filter((e: any) => e.domains.includes('all') || e.domains.includes(r) || r === 'skeptic' || r === 'chair');
      const render = (r: string, extra = '') =>
        `SUBJECT: ${dossier.subject.title}\nEVIDENCE:\n${slice(r).map((e: any) => `${e.id} [${e.source}] ${e.text}`).join('\n')}\nANCHORS:\n${dossier.anchors.map((a: any) => `${a.id}: ${a.label}`).join('\n')}\n${extra}`;
      const speak = async (r: string, extra = '', smart = false) => {
        const schema = r === 'chair' ? ChairSchema : TurnSchema;
        const raw = await structured<any>({ schema, smart, system: SYSTEM(r, LENS[r], dossier.subject.question), prompt: render(r, extra) });
        const t = cleanTurn(raw, ids, anchorIds);                 // normalise votes to 100, drop invalid cites/anchors
        turns[r] = t; send({ t: 'turn', role: r, turn: t });
        return t;
      };
      const said = () => Object.entries(turns).map(([r, t]: any) => `${r}: ${t.say} | go ${t.go} caution ${t.caution} nogo ${t.nogo}`).join('\n');
      try {
        send({ t: 'stage', name: 'round1' });
        await Promise.allSettled(['chemist', 'toxicologist', 'pharmacologist'].map((r) => speak(r).catch((e) => send({ t: 'error', role: r, msg: String(e.message ?? e) }))));
        send({ t: 'stage', name: 'crossexam' });
        const d = await speak('skeptic', `TURNS SO FAR:\n${said()}`);
        const tgt = ['chemist', 'toxicologist', 'pharmacologist'].includes(d.target) && turns[d.target] ? d.target : null;
        if (tgt) { send({ t: 'stage', name: 'rebuttal' }); await speak(tgt, `DOUBT ATTACKS YOU: ${d.say}\nRespond briefly. You MAY revise your votes if the attack is valid.`); }
        send({ t: 'stage', name: 'ruling' });
        await speak('chair', `TURNS:\n${said()}\nDRIVERS:\n${dossier.drivers.map((x: any) => `${x.label} (${x.delta})`).join('\n')}\nPRIOR: ${JSON.stringify(dossier.prior)}`, true);
        send({ t: 'verdict', verdict: finalize(turns, dossier.prior, dossier.coverage, dossier.drivers) });
      } catch (e: any) { send({ t: 'error', role: 'system', msg: String(e.message ?? e) }); }
      c.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
```
- `cleanTurn`: clamp each vote to 0-100, rescale to sum 100, **filter `cites` to ids that exist** (count `verified/total` for the HUD), replace unknown `anchor` with `"none"`.
- `finalize` implements §4.4 and returns the §2.3 output contract (minus `transcript`, which the client assembles).
- A rebuttal **replaces** that agent's earlier votes; the client keeps both and plays the "changed mind" animation when the vote shifts ≥ 10.
- A seat that errors shows **Retry** (calls `/api/jury` for that single role with the same context). Never leave a seat stuck on "thinking".

### 8.10 `components/Viewer3D.tsx` (spec + the part that matters)
Modes chosen from `dossier.structure[]`:

| Mode | Source | Display |
|---|---|---|
| `pdb` | uploaded file text, or `files.rcsb.org/download/{ID}.pdb` | cartoon; co-crystal ligand as sticks; residues within 5 Å of the ligand as sticks |
| `alphafold` | `pdbUrl` from AlphaFold DB | cartoon coloured by pLDDT (stored in the B-factor column) |
| `conformer` | PubChem 3D SDF | ball-and-stick, flagged atoms as red translucent spheres with labels |
| `flat` | RDKit molblock (no 3D available) | same as above with a visible "2D layout, no 3D conformer" tag |
| `none` | | show 2D only (`Mol2D`) |

```ts
// colour & focus helpers (3Dmol). Verify selector names against the installed version.
const plddt = (a: any) => (a.b > 90 ? '#0053d6' : a.b > 70 ? '#65cbf3' : a.b > 50 ? '#ffdb13' : '#ff7d45');
protein:   v.setStyle({}, { cartoon: { colorfunc: plddt } });                 // alphafold
           v.setStyle({}, { cartoon: { color: 'spectrum', opacity: 0.85 } });  // pdb
pocket:    v.setStyle({ within: { distance: 5, sel: { resn: lig } }, not: { resn: lig } }, { stick: { radius: 0.15 }, cartoon: {} });
           v.setStyle({ resn: lig }, { stick: { radius: 0.25, colorscheme: 'greenCarbon' } });
molecule:  v.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.22 } });

function focus(anchor: Anchor) {
  v.removeAllLabels();
  if (anchor.type === 'atoms' && anchor.atoms?.length) {
    const serials = anchor.atoms.map((i) => i + 1);                           // SDF serial = index + 1; verify in the acceptance test
    v.addStyle({ serial: serials }, { sphere: { color: '#ef4444', radius: 0.55, opacity: 0.55 } });
    v.addLabel(anchor.label, { backgroundColor: '#ef4444', fontColor: 'white', fontSize: 12 }, { serial: serials[0] });
    v.zoomTo({ serial: serials }, 900);
  } else if (anchor.type === 'residues') {
    const sel = { or: anchor.residues!.map((r) => ({ chain: r.chain, resi: r.resi })) };
    v.addStyle(sel, { stick: { colorscheme: 'orangeCarbon' } }); v.zoomTo(sel, 900);
  } else if (anchor.type === 'ligand') { v.zoomTo({ resn: anchor.resn }, 900); }
  else v.zoomTo({}, 900);
  v.render();
}
```
**Index trap:** match SMARTS on the **same molblock you display** (load the SDF into RDKit, run `get_substruct_matches`, keep those indices). Never reuse indices from a SMILES parse, because atom order differs.

**Honesty labels in the viewer:** a small caption always shows the structure's provenance ("PDB 1IEP, experimental", "AlphaFold prediction, mean pLDDT 87", "PubChem 3D conformer, computed") and the line **"Your molecule is not docked into this protein."** whenever a molecule and a protein are shown together.

---

## 9. UI spec: the Chamber

### 9.1 Look and feel
It should feel like a **courtroom / war-room game**: dark theme, glow, five seats on an arc, speech bubbles that type out, a live tug-of-war bar, a stage tracker. No points, no leaderboards. (The "game" is the **discussion**, not a score.) Keep the v1 design tokens (v1 §11.1): the `data-verdict` attribute on `<html>` swaps the accent colour (GO emerald, CAUTION amber, NO_GO crimson). The accent shifts at the ruling.

### 9.2 Screens
1. **Drop screen**: one large drop zone (text box + drag/drop file + paste image + "or try an example" chips from the gold set). Accepts `.sdf .mol .pdb .cif .fasta .png .jpg`, 5 MB max. Single "Analyze" button.
2. **Confirm card**: "Here's what I understood": subject kind chip, 2D structure (RDKit SVG) next to the original image if any, resolved names/IDs, and the sentence `understood`. Buttons: **Looks right → Convene the jury**, **Edit** (inline SMILES/name field), and a compound-vs-protein switch when ambiguous. Shows a low-confidence warning when `confidence !== 'high'`.
3. **Chamber** (desktop, 3 columns):

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Stage tracker:  Intake ● Dossier ● Round 1 ○ Cross-exam ○ Rebuttal ○ Ruling│
├───────────────┬───────────────────────────────┬───────────────────────────┤
│ SEATS + TALK  │ 3D VIEWER (flies to anchors)  │ LIVE VERDICT              │
│ Atom   [bub]  │  caption: provenance          │  GO ▇▇░░░░  21%           │
│ Venom  [bub]  │  [2D / 3D toggle]             │  CAUTION ▇▇▇░░ 30%        │
│ Lock   [bub]  │                               │  NO-GO ▇▇▇▇▇▇ 49%         │
│ Doubt  [bub]  │  tension meter                │  confidence · evidence    │
│ Gavel  [bub]  │                               │  Citations verified 9/10  │
├───────────────┴───────────────────────────────┴───────────────────────────┤
│ After ruling: banner → WHY panel (drivers, clickable) → Reasons · Risks ·  │
│ Next steps → Evidence ledger (E# chips open source URL)                    │
└───────────────────────────────────────────────────────────────────────────┘
```
4. **Mobile:** tabs `Debate | 3D | Verdict`.

### 9.3 Behaviours that make it feel alive
- **Seat animation:** speaker's seat glows in its colour; bubble types out (~25 ms/char, skippable with a click or Space); previous bubbles dim but stay.
- **Camera follows speech:** when a turn lands with `anchor ≠ none`, the viewer calls `focus(anchor)`.
- **Live percentage bar:** after every turn, recompute `finalize()` client-side on the turns so far and animate the three bars (label it "live estimate" until the ruling).
- **Tension meter:** standard deviation of the specialists' `nogo` votes, scaled 0-100. Spikes when Doubt attacks.
- **Changed-mind flash:** if the rebutting agent's top vote changes or any vote moves ≥ 10, show a "changed mind" tag with a before → after arrow.
- **Citation chips:** `[E4]` in a bubble is a chip; click scrolls the ledger and opens the source URL. Unverified citations never render as chips.
- **Ruling ceremony:** gavel sound (optional), banner slides in, `data-verdict` flips the accent, percentage bars settle, camera goes to the top driver's anchor.
- **WHY panel (the "3D analysis of why"):** drivers listed as a signed bar chart (green toward GO, red toward NO-GO). **Click a driver → the 3D view flies to its atoms/residues** and highlights them. Each reason from Gavel is also clickable if it carries an anchor.
- **Errors:** a failed seat shows an inline Retry; the rest continue. If Gemini is rate-limited and Groq also fails, show a clear "model busy, try again in a minute" toast, not a hang.
- **About popover:** the honesty list from §1.5, §5.2 dataset sources with AUCs, the §4.4 formula, and "Gemini free tier may use prompts to improve Google products."

### 9.4 State machine (zustand)
`idle → resolving → confirm → dossier → round1 → crossexam → rebuttal → ruling → done | error`. Store: `subject`, `dossier`, `turns` (array, in order), `live` (running percentages), `activeAnchor`, `verdict`. No persistence needed (optionally `zustand/persist` for the last 5 runs).

---

## 10. 4-hour plan with acceptance tests

**Reality check:** this is achievable in 4 hours with a coding agent generating from this doc and you reviewing and testing; it is **not** achievable typing it all by hand. The riskiest pieces are image input and the Colab parity test, so they are scheduled to be cut first.

| Time | Milestone | Acceptance test (must pass before moving on) |
|---|---|---|
| **T-30** | Pre-flight (§6.1), Colab brain run **started**, keys set, Vercel connected | Vercel URL loads; `public/rdkit/*.wasm` is several MB; Colab running |
| **0:00–0:30** | Skeleton, theme, v1 `rdkit.ts` + `alerts.ts` + `analyze.ts`, `Mol2D`, `Viewer3D` (conformer + pdb modes) | Paste terfenadine SMILES in a test page: 2D shows, `herg_pattern` present; fexofenadine: absent. Flagged atoms turn red in 3D (checks the serial = index+1 assumption) |
| **0:30–1:15** | **Intake**: `sniff`, DropZone, `/api/resolve` (names, SMILES, PDB id, UniProt, FASTA, SDF/PDB files, mixtures), Confirm card | `terfenadine`, `EGFR`, `1IEP`, a pasted SMILES, an uploaded `.sdf`, and `paracetamol + caffeine` each reach a correct Confirm card; `asdfgh` and `C1CC` are rejected with a clear message |
| **1:15–2:00** | **Dossier**: `sources.ts`, `/api/dossier`, `brain.ts` (B2/B3), `evidence.ts`, priors, anchors, coverage | Colab files in place; aspirin fingerprint **parity test passes**; terfenadine dossier shows hERG model probability with AUC, nearest precedents, E# list, ≥ 3 anchors, coverage > 50%; a fake compound shows low coverage and an out-of-domain note |
| **2:00–2:50** | **Chamber**: schemas, prompts, `/api/jury`, store, stream consumer, Seats, Bubbles, live PercentBar, StageTracker | Run terfenadine: Atom/Venom/Lock appear, Doubt attacks, a rebuttal runs, Gavel rules; percentages sum to 100; citations show `x/y`. Run fexofenadine: **different** verdict. If both match, fix evidence slicing before moving on |
| **2:50–3:20** | **3D why**: anchor flight on each turn, WHY panel with clickable drivers, VerdictPanel (reasons/risks/next steps), theme flip, Ledger | Click the hERG driver → camera lands on the basic amine; protein run (EGFR) shows binding-site residues highlighted and pLDDT colouring when AlphaFold is used |
| **3:20–3:40** | **Image input** + mixture polish | `terfenadine` PNG from PubChem resolves to the right compound on the Confirm card; a deliberately wrong image shows a low-confidence warning, not a confident wrong answer |
| **3:40–4:00** | `npm run eval`, About popover, mobile tabs, final deploy, rehearse | Eval prints gold-set accuracy and a ClinTox-holdout number; production URL passes the §12 demo path twice; `grep -r "AIza\|gsk_" .next/static` returns nothing |

### 10.1 `scripts/eval.mjs` (spec)
Loops over `data/seeds.json` (and 200 random ClinTox SMILES), runs **dossier + rule prior only** (no LLM, so it is fast and free) and prints: per-case `rulePrior` call vs truth, accuracy, confusion matrix. Use it to tune the §8.5 deltas and the §4.4 weights, **then** run the full LLM jury on the 12 gold cases once and record the result in the README. Report the numbers as they are.

---

## 11. Honest limits and cut list

### 11.1 Limits (put these in the About popover and say them out loud)
- Percentages are **evidence-weighted jury confidence**, not clinical probabilities.
- B2 models are simple, with AUCs typically ~0.7-0.85 on held-out data; each is shown with its AUC and an applicability flag.
- No docking or affinity prediction. A molecule shown next to a protein is **not** docked.
- AlphaFold structures are predictions; pLDDT is shown.
- Image reading is error-prone; the Confirm card exists for this reason.
- Famous drugs may be recognised by the LLM from structure or name; this affects Blind-style demos.
- Not covered: polymers, inorganics, materials, nucleic acids, antibodies, food/cosmetic formulations. Say "unsupported input type" instead of guessing.
- Free tiers: rate limits, possible 429s, and Google may use free-tier prompts.

### 11.2 Risks and mitigations
| Risk | Mitigation |
|---|---|
| Gemini 429 / model name change | `GEMINI_*` in env; Groq fallback; retry once with 2 s backoff; clear toast |
| Public API down or slow | `allSettled`, 6 s timeouts, each missing source lowers **coverage** rather than breaking the run |
| RDKit wasm fails | files committed in `public/rdkit`; unpkg fallback from v1; 2D/3D viewers degrade gracefully |
| Fingerprint mismatch (Python vs JS) | mandatory parity test (§5.3) |
| Every verdict is CAUTION | check evidence slicing (`domains`), the Chair prompt, and the prior deltas via `npm run eval` |
| Vercel function timeout | `maxDuration = 60`; stream events; specialists run in parallel |
| Uploaded file is huge/malicious | 5 MB cap, parse client-side, never send `pdbText` to the LLM |
| Hallucinated citations | server-side `cleanTurn` drops ids that do not exist; HUD shows `x/y` |

### 11.3 Cut list (in this order if behind)
1. Image input (keep text, SMILES, files)
2. Mixtures (keep single molecule/protein/complex)
3. Rebuttal beat (keep Doubt as the final specialist turn)
4. Typewriter effect, gavel sound, tension meter
5. B2 models (keep B3 precedents and rules)
6. FASTA → structure search
**Never cut:** Intake → Confirm → Dossier → live debate → verdict with percentages → clickable "why" in 3D. That is the product.

### 11.4 Stretch (only after §10 is green)
Analog Forge from v1 §12 (LLM proposes SMILES, RDKit validates, jury re-scores), shareable run links via Neon (v1 §16.1), compare mode, print report, ESMFold prediction for sequences without a structure, voice.

---

## 12. Demo script (about 3 minutes)
1. **Hook (15 s):** "90% of drug candidates fail, usually late and expensively, and the warning signs were often visible early. MoleculeJury puts five AI specialists in a room with the evidence, and you watch them argue."
2. **Drop in a mystery SMILES (catechol-rhodanine) (60 s):** Confirm card, then the chamber. Lock supports (potent screen hit), Atom vetoes (PAINS), the ring lights up in 3D, Doubt attacks Lock, Lock lowers his GO vote. **NO-GO, ~70%, evidence MEDIUM.** Point at the WHY panel and click the PAINS driver.
3. **Drop in a name (terfenadine) (40 s):** hERG model + nearest precedents + FDA/ChEMBL withdrawal evidence. NO-GO. Then drop in **fexofenadine**: the verdict flips, with the carboxylic acid removing the hERG pattern.
4. **Drop in a protein (EGFR) (30 s):** the verdict is about **target tractability**: pLDDT/PDB structure, binding-site residues in 3D, Open Targets tractability and safety.
5. **Drop in a photo of a drawn structure (20 s):** show the Confirm card catching what it read, and correcting it.
6. **Close (15 s):** "Hypothesis triage, not magic: evidence in, cited verdict out, with percentages that tell you how sure we are and why."

**Backups:** pre-run the demo inputs once; keep screenshots of each verdict in case the free-tier models are rate-limited on stage.

---

## 13. Master prompt for a coding agent (attach this file and v1)
```
You are building "MoleculeJury v2" exactly as specified in MOLECULEJURY_BRAIN_v2.md.
v1 (MOLECULEJURY_BRAIN.md) is only a source of: rdkit.ts, alerts.ts, analyze.ts, seeds.json, next.config.ts, types.d.ts,
copy-rdkit.mjs, and design tokens. Do not build v1's prediction game, case board, voice, or illustration.
Rules:
1. Follow Section 10's order; run each acceptance test and commit after every row.
2. Use the code blocks verbatim where given; implement the specs exactly as written.
3. All LLM calls go through /app/api routes; never expose API keys in client code.
4. Zod schemas sent to LLMs must not use .optional(), .min(), .max(). Clamp in code.
5. The debate never starts without the user pressing "Convene the jury" on the Confirm card.
6. Every citation is verified server-side; unverified ids are dropped and counted.
7. Never send uploaded file contents (pdbText) to an LLM. Images go only to /api/resolve.
8. Percentages always sum to 100 and are computed by finalize() (Section 4.4), not by the LLM.
9. Match SMARTS on the exact molblock displayed in 3D; never reuse atom indices from a different parse.
10. If the doc conflicts with an installed library version, make the smallest fix and leave a one-line comment.
11. Missing data lowers "coverage"; it never crashes a run.
Start with Section 6.1, then Milestone 0:00-0:30.
```

---
*End of brain v2. Build the loop first: input → confirm → dossier → debate → verdict → why. Polish second.*

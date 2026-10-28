import { decide } from '../lib/ai/decisions';
import type { Dossier } from '../lib/types';
const dossier = {
  subject: {
    title: 'Connectivity check',
    kind: 'small_molecule',
    question: 'Is there enough evidence to advance this unknown candidate?',
    components: [],
  },
  evidence: [],
  anchors: [],
  drivers: [],
  prior: { go: 0, caution: 100, nogo: 0 },
} as unknown as Dossier;
decide(dossier, [])
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

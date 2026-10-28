import { readFileSync } from 'node:fs';
import { serverRDKit } from '../lib/chem/server';
import { fingerprint } from '../lib/brain';
async function main() {
  const p = JSON.parse(readFileSync('public/brain/parity.json', 'utf8'));
  const rd = await serverRDKit();
  const actual = fingerprint(rd, p.smiles);
  if (actual !== p.fp)
    throw new Error(`Python/JS Morgan fingerprint mismatch (${actual.length} vs ${p.fp.length})`);
  console.log(
    `PASS: aspirin Morgan fingerprint parity (${actual.length} bits). Python RDKit ${p.rdkitVersion}; JS RDKit ${rd.version()}.`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

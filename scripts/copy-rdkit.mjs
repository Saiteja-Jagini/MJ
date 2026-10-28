import fs from 'node:fs';
import path from 'node:path';
const src = 'node_modules/@rdkit/rdkit/dist',
  dst = 'public/rdkit';
fs.mkdirSync(dst, { recursive: true });
for (const f of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}

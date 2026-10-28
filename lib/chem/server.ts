import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pending: Promise<any> | undefined;
export function serverRDKit(): Promise<any> {
  if (!pending) {
    const init = require('@rdkit/rdkit');
    pending = init({
      locateFile: (f: string) => path.join(process.cwd(), 'node_modules/@rdkit/rdkit/dist', f),
    });
  }
  return pending!;
}
export async function validateMolecule(input: string) {
  const rd = await serverRDKit();
  let mol;
  try {
    mol = rd.get_mol(input);
    if (!mol || !mol.is_valid())
      throw new Error(
        'The molecular structure is invalid. Check the SMILES or upload a valid MOL/SDF file.',
      );
    if (mol.get_num_atoms() > 1000)
      throw new Error(
        'This structure is too large. Please use a small molecule with fewer than 1,000 atoms.',
      );
    return { smiles: mol.get_smiles() as string, molblock: mol.get_molblock() as string };
  } finally {
    mol?.delete();
  }
}

export function compatibleConformer(rd: any, smiles: string, block: string): boolean {
  let expected: any, actual: any;
  try {
    expected = rd.get_mol(smiles);
    actual = rd.get_mol(block);
    if (!expected || !actual) return false;
    // Hydrogen normalization is used only for identity comparison. The displayed SDF remains untouched.
    expected.remove_hs_in_place();
    actual.remove_hs_in_place();
    const plain = JSON.stringify({ doIsomericSmiles: false });
    if (expected.get_smiles(plain) !== actual.get_smiles(plain)) return false;
    // Respect explicitly specified input stereochemistry; unspecified centres may use one computed conformer.
    const match = JSON.parse(
      actual.get_substruct_match(expected, JSON.stringify({ useChirality: true })),
    );
    return Array.isArray(match.atoms) && match.atoms.length === expected.get_num_atoms();
  } catch {
    return false;
  } finally {
    expected?.delete();
    actual?.delete();
  }
}

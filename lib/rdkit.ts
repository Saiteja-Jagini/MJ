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

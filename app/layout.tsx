import type { Metadata } from 'next';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import { Toaster } from 'sonner';
import './globals.css';
export const metadata: Metadata = {
  title: 'MoleculeJury — Every molecule deserves a fair hearing',
  description:
    'Five scientific perspectives. One evidence-backed research decision. Explore molecules, targets, and their evidence in an interactive jury chamber.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-verdict="neutral">
      <body>
        {children}
        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}

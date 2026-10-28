'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="loading-page">
      <h1>Something interrupted the workspace.</h1>
      <p>Your saved analyses remain in PostgreSQL.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

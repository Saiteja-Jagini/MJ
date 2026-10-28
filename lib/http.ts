import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function readJson(req: Request, limit = 7_500_000): Promise<unknown> {
  if (Number(req.headers.get('content-length') ?? 0) > limit)
    throw new AppError('Input is too large. Files must be 5 MB or smaller.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError('Input is too large.', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError('The request body is not valid JSON.');
  }
}
export function apiError(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`)
          .slice(0, 4)
          .join('; '),
      },
      { status: 422 },
    );
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(
    'Request failed:',
    e instanceof Error ? e.name : 'Unknown error',
    e instanceof TypeError ? e.message : '',
    e instanceof Error ? e.stack?.split('\n').slice(1, 4).join('\n') : '',
  );
  return NextResponse.json(
    { error: 'This step could not finish. Please retry; your input has been kept.' },
    { status: 500 },
  );
}

import { cookies } from 'next/headers';
import { z } from 'zod';
export async function sessionId() {
  const jar = await cookies();
  const existing = jar.get('mj-session')?.value;
  if (existing && z.string().uuid().safeParse(existing).success) return existing;
  const id = crypto.randomUUID();
  jar.set('mj-session', id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return id;
}

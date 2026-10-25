import { createHash, randomBytes } from 'node:crypto';

export function createReconnectToken() {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashReconnectToken(token) };
}

export function hashReconnectToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

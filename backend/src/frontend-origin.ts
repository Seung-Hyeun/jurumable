import 'dotenv/config';

// The one browser origin REST and Socket.IO CORS allow: the Next.js frontend
// (scheme + host + port, no trailing slash). Set FRONTEND_ORIGIN per environment;
// local development falls back to the Next.js dev server. `||`, not `??`: an empty
// origin would make CORS allow every origin.
export const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

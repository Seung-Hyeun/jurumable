// The player's room session. Without accounts, the reconnect token in localStorage is what
// lets this browser come back as the same player. Only call these from client-side code.
const SESSION_KEY = "drinking-board-game-session";

export interface Session {
  roomCode: string;
  playerId: string;
  displayName: string;
  reconnectToken: string;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fields = ["roomCode", "playerId", "displayName", "reconnectToken"];
  return fields.every((field) => {
    const item = (value as Record<string, unknown>)[field];
    return typeof item === "string" && item.length > 0;
  });
}

export function getSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    return isSession(value) ? value : null;
  } catch {
    // No window (server), storage blocked, or corrupted JSON: treat as no session.
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked (e.g. some private modes): the room still works until reload.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored or storage blocked: nothing to clear.
  }
}

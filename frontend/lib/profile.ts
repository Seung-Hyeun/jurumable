import { nicknameError } from "./api";

// The nickname this browser last created or joined a room with, offered as the next default.
// A convenience only: kept apart from the room session (no token here) and from the settings
// (a settings reset leaves it), and never trusted: it only fills the input, and the backend still
// validates what is sent. Only call these from client-side code.
const PROFILE_KEY = "drinking-board-game-profile";

export function getRecentNickname(): string {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    const nickname = (value as { nickname?: unknown } | null)?.nickname;
    // A wrong shape, an empty or too long name: as if nothing were stored.
    return typeof nickname === "string" && nicknameError(nickname) === null ? nickname : "";
  } catch {
    // No window (server), storage blocked, or broken JSON.
    return "";
  }
}

// After a successful create / join only. Failing to store it changes nothing else.
export function saveRecentNickname(nickname: string) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ nickname }));
  } catch {
    // Storage blocked (e.g. some private modes): the next form simply starts empty.
  }
}

// Another tab saving a nickname; this tab's own saves need no event.
export function subscribeRecentNickname(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

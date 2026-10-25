// This browser's own settings (sound, animation, theme). They belong to no room: nothing here is
// sent to the server, and they live under their own key, apart from the room session, so clearing
// one never clears the other. Only call these from client-side code (the script string is the
// exception: the root layout puts it in <head>).
export type Theme = "LIGHT" | "DARK" | "SYSTEM";

export type AppSettings = {
  bgmEnabled: boolean;
  soundEffectsEnabled: boolean;
  animationsEnabled: boolean;
  theme: Theme;
};

export const SETTINGS_KEY = "drinking-board-game-settings";

export const DEFAULT_SETTINGS: AppSettings = {
  bgmEnabled: true,
  soundEffectsEnabled: true,
  animationsEnabled: true,
  theme: "SYSTEM",
};

const THEMES: readonly string[] = ["LIGHT", "DARK", "SYSTEM"];
export const DARK_QUERY = "(prefers-color-scheme: dark)";

// What is stored is only a hint: each field falls back to its default when it is missing or of
// the wrong kind (an older version, a hand edit, broken JSON), and an unknown theme means SYSTEM.
function parseSettings(raw: string | null): AppSettings {
  let stored: unknown = null;
  try {
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
    // Not JSON: the defaults.
  }
  const value = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const flag = (key: "bgmEnabled" | "soundEffectsEnabled" | "animationsEnabled") => {
    const item = value[key];
    return typeof item === "boolean" ? item : DEFAULT_SETTINGS[key];
  };
  return {
    bgmEnabled: flag("bgmEnabled"),
    soundEffectsEnabled: flag("soundEffectsEnabled"),
    animationsEnabled: flag("animationsEnabled"),
    theme: typeof value.theme === "string" && THEMES.includes(value.theme) ? (value.theme as Theme) : "SYSTEM",
  };
}

// The same stored string always gives back the same object (useSyncExternalStore relies on it).
let cached: { raw: string | null; settings: AppSettings } = { raw: null, settings: DEFAULT_SETTINGS };
// Used instead when storage is blocked, so a change still holds until the page is closed.
let unsaved: AppSettings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    // No window (server) or storage blocked.
    return unsaved ?? DEFAULT_SETTINGS;
  }
  if (raw !== cached.raw) {
    cached = { raw, settings: parseSettings(raw) };
  }
  return cached.settings;
}

export function saveSettings(settings: AppSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    unsaved = settings;
  }
  listeners.forEach((listener) => listener());
}

// Back to DEFAULT_SETTINGS; the room session (another key) is left alone.
export function resetSettings() {
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // Nothing stored or storage blocked.
  }
  unsaved = null;
  listeners.forEach((listener) => listener());
}

// Called after a save / reset in this tab, and when another tab changes the settings.
export function subscribeSettings(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY || event.key === null) {
      listener();
    }
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// Both choices are classes on <html>: `dark` turns Tailwind's dark: classes on, `animations-off`
// stops decorative motion (globals.css). SYSTEM follows the OS / browser setting.
export function applySettings({ theme, animationsEnabled }: AppSettings) {
  const dark = theme === "DARK" || (theme === "SYSTEM" && window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("animations-off", !animationsEnabled);
}

// applySettings for the very first paint: an inline script in <head> runs it while the HTML is
// parsed, so a reload never flashes the light theme. It cannot import anything, hence the copy.
export const SETTINGS_SCRIPT = `(function(){var s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}))||{}}catch(e){}try{var t=s.theme,c=document.documentElement.classList;c.toggle("dark",t==="DARK"||(t!=="LIGHT"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches));c.toggle("animations-off",s.animationsEnabled===false)}catch(e){}})()`;

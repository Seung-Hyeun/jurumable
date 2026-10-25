import Link from "next/link";
import type { ReactNode } from "react";

// Shared styles for every screen; touch-friendly heights, hover / pressed, visible focus and
// disabled states. Primary = the main action of a screen, secondary = the other choices.
const buttonBase =
  "flex h-14 w-full items-center justify-center rounded-2xl px-5 text-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed";

export const primaryButton = `${buttonBase} bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:bg-violet-800 focus-visible:ring-violet-300 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 dark:disabled:text-zinc-400 disabled:shadow-none`;

export const secondaryButton = `${buttonBase} bg-white dark:bg-zinc-900 text-violet-700 dark:text-violet-300 ring-2 ring-violet-200 dark:ring-violet-400/40 hover:bg-violet-50 dark:hover:bg-violet-500/10 active:bg-violet-100 dark:active:bg-violet-500/20 focus-visible:ring-violet-400 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-400 dark:disabled:text-zinc-500 disabled:ring-zinc-200 dark:disabled:ring-zinc-700`;

// The white card every screen is built from.
export const cardClass = "rounded-3xl bg-white dark:bg-zinc-900 p-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10 sm:p-6";

export const inputClass =
  "h-14 w-full rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 text-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-100 dark:focus-visible:ring-violet-500/30 aria-invalid:border-rose-400";

// A radio choice drawn as a button (max players, mission type, theme). The input stays inside
// the label (sr-only), so arrow keys and screen readers work as in any radio group.
export const optionClass =
  "flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-base font-bold text-zinc-700 dark:text-zinc-300 transition-colors hover:border-violet-300 dark:hover:border-violet-400/60 has-checked:border-violet-600 has-checked:bg-violet-600 has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-violet-200";

// The line under a form field: its help text, or the field's validation error in its place.
// The input points at it with aria-describedby.
export function FieldMessage({
  id,
  hint,
  error,
}: {
  id: string;
  hint: string;
  error: string | null;
}) {
  return error ? (
    <p id={id} role="alert" className="text-sm font-bold text-rose-700 dark:text-rose-300">
      {error}
    </p>
  ) : (
    <p id={id} className="text-sm text-zinc-500 dark:text-zinc-400">
      {hint}
    </p>
  );
}

// Compact actions inside lists and the header (edit / delete / kick / end game); still 44px tall
// for touch. Danger is a white button with red text, not a red block.
const smallBase =
  "inline-flex h-11 min-w-16 items-center justify-center rounded-xl px-4 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50";

export const smallButton = `${smallBase} bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-300 dark:ring-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 active:bg-zinc-200 dark:active:bg-zinc-600 focus-visible:ring-violet-300`;

export const smallPrimaryButton = `${smallBase} bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800 focus-visible:ring-violet-300`;

export const smallDangerButton = `${smallBase} bg-white dark:bg-zinc-800 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-400/40 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:bg-rose-100 dark:active:bg-rose-500/20 focus-visible:ring-rose-300`;

const WIDTH = {
  narrow: "max-w-md",
  wide: "max-w-2xl",
  // One column on phones, two columns (players | contents) on desktop.
  split: "max-w-2xl lg:max-w-5xl",
  // The game screen: as split, plus a game history column left of the board on wide screens.
  game: "max-w-2xl lg:max-w-5xl xl:max-w-[88rem]",
};

export function PageShell({
  children,
  back,
  width = "narrow",
}: {
  children: ReactNode;
  back?: { href: string; label: string };
  width?: keyof typeof WIDTH;
}) {
  return (
    <div className="flex flex-1 flex-col bg-linear-to-b from-amber-50 via-orange-50 to-rose-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-violet-950 px-4 py-6 text-zinc-900 dark:text-zinc-100">
      {/* break-keep: Korean text wraps at spaces instead of mid-word. */}
      <main
        className={`mx-auto flex w-full flex-1 flex-col break-keep ${WIDTH[width]}`}
      >
        {back && (
          <Link
            href={back.href}
            className="mb-4 -ml-2 inline-flex min-h-11 items-center self-start rounded-lg px-2 text-base font-semibold text-zinc-600 dark:text-zinc-400 hover:text-violet-700 dark:hover:text-violet-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
          >
            ← {back.label}
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      className="rounded-2xl bg-rose-100 dark:bg-rose-500/20 px-4 py-3 text-base font-medium text-rose-800 dark:text-rose-200"
    >
      {message}
    </p>
  );
}
